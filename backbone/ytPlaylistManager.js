const axios = require('axios');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const https = require('https');
const path = require('path');
const NodeID3 = require('node-id3');
const nodeZip = require('node-zip');

// Improved filename sanitization function
function sanitizeFilename(filename) {
    // Remove problematic file system characters
    let sanitized = filename
        .replace(/[<>:"/\\|?*]/g, '')  // Remove illegal file system characters
        .trim();  // Remove leading and trailing whitespace

    // Remove .mp3 extension if it already exists
    sanitized = sanitized.replace(/\.mp3$/i, '');

    // Ensure the filename ends with .mp3
    return sanitized + '.mp3';
}

async function downloadPlaylist(message, tempFilePath) {
    return new Promise(async (resolve, reject) => {
        try {
            // Read and parse the playlist data
            const tempFile = fs.readFileSync(tempFilePath, 'utf-8');
            let playlistData;
            try {
                playlistData = JSON.parse(tempFile);
            } catch (err) {
                throw new Error('Failed to parse playlist data as JSON: ' + err.message);
            }

            // Validate videos
            if (!playlistData.videos || !Array.isArray(playlistData.videos) || playlistData.videos.length === 0) {
                throw new Error('No videos found in the playlist data');
            }

            // Ensure temp directory exists
            const fileNameWithExtension = path.basename(tempFilePath);
            const folderName = fileNameWithExtension.slice(0, -11); // Remove last 6 characters
            const downloadDir = `temp/${folderName}`;
            fs.mkdirSync(downloadDir, { recursive: true });

            // Results array to track downloads
            const results = [];

            // Initial status message
            let statusMessage = await message.reply(`Preparing to download ${playlistData.videos.length} videos...`);

            // Sequential download function
            async function processVideo(video, index) {
                try {
                    // Update status message
                    await statusMessage.edit(`Processing video ${index + 1} of ${playlistData.videos.length}: ${video.title}`);

                    // Get download URL from Cobalt API
                    const response = await axios({
                        method: 'POST',
                        url: 'https://ytapi.chocbox.org/',
                        data: {
                            url: video.shortUrl,
                            filenameStyle: 'basic',
                            audioFormat: 'mp3',
                            downloadMode: 'audio',
                            youtubeDubLang: 'en',
                            audioBitrate: '320',
                        },
                        headers: {
                            'Accept': 'application/json',
                            'Content-Type': 'application/json'
                        }
                    });

                    // Validate response
                    if (!response.data || !response.data.status) {
                        throw new Error('Invalid response from Cobalt API');
                    }

                    // Extract download URL
                    let downloadURL, filename;
                    if (response.data.status === 'redirect' || response.data.status === 'tunnel') {
                        downloadURL = response.data.url;
                        filename = response.data.filename;
                    } 
                    else if (response.data.status === 'picker' && response.data.picker?.length > 0) {
                        downloadURL = response.data.picker[0].url;
                        filename = response.data.picker[0].filename || 'unknown';
                    }
                    else if (response.data.status === 'error') {
                        throw new Error(`API error: ${response.data.error?.code || 'unknown'}`);
                    }
                    else {
                        throw new Error(`Unexpected response status: ${response.data.status}`);
                    }

                    if (!downloadURL) {
                        throw new Error('No download URL found in response');
                    }

                    // Get just the title part without artist
                    const titleOnly = video.title || filename;
                    
                    // Use improved sanitization
                    const sanitizedTitle = sanitizeFilename(titleOnly);
                    const audioOutputPath = path.join(downloadDir, sanitizedTitle);

                    // Download audio file
                    const audioResponse = await axios({
                        method: 'get',
                        url: downloadURL,
                        responseType: 'stream'
                    });

                    const audioWriter = fs.createWriteStream(audioOutputPath);
                    audioResponse.data.pipe(audioWriter);

                    // Wait for audio download to complete
                    await new Promise((resolveDownload, rejectDownload) => {
                        audioWriter.on('finish', resolveDownload);
                        audioWriter.on('error', rejectDownload);
                    });

                    console.log(`Downloaded ${sanitizedTitle} successfully.`);

                    // Thumbnail processing
                    let thumbnailPath = null;
                    if (video.thumbnail || video.thumbnails?.[0]?.url) {
                        console.log(`Processing thumbnail for ${sanitizedTitle}...`);
                        const thumbnailUrl = video.thumbnail || video.thumbnails[0].url;
                        const thumbnailOutputPath = path.join(downloadDir, sanitizedTitle.replace('.mp3', '.jpg'));
                        const croppedThumbnailPath = path.join(downloadDir, sanitizedTitle.replace('.mp3', '_cropped.jpg'));

                        // Download thumbnail
                        const thumbnailResponse = await axios({
                            method: 'get',
                            url: thumbnailUrl,
                            responseType: 'stream'
                        });

                        const thumbnailWriter = fs.createWriteStream(thumbnailOutputPath);
                        thumbnailResponse.data.pipe(thumbnailWriter);

                        await new Promise((resolveThumb, rejectThumb) => {
                            thumbnailWriter.on('finish', resolveThumb);
                            thumbnailWriter.on('error', rejectThumb);
                        });

                        // Crop thumbnail to square using FFmpeg
                        await new Promise((resolveCrop, rejectCrop) => {
                            console.log(`Cropping thumbnail for ${sanitizedTitle}...`);
                            ffmpeg(thumbnailOutputPath)
                                .outputOptions([
                                    '-vf', 'crop=min(iw\\,ih):min(iw\\,ih)', // Crop to square from center
                                    '-q:v', '2' // Maintain good quality
                                ])
                                .output(croppedThumbnailPath)
                                .on('end', () => {
                                    // Remove original thumbnail
                                    fs.unlinkSync(thumbnailOutputPath);
                                    // Rename cropped thumbnail to original name
                                    fs.renameSync(croppedThumbnailPath, thumbnailOutputPath);
                                    thumbnailPath = thumbnailOutputPath;
                                    resolveCrop();
                                })
                                .on('error', (err) => {
                                    console.error(`Thumbnail crop error: ${err.message}`);
                                    rejectCrop(err);
                                })
                                .run();
                        });

                        console.log('thumbnailPath', thumbnailPath);
                        console.log(`Adding thumbnail metadata to ${sanitizedTitle}...`);
                        
                         // Add a small delay to ensure file operations are complete
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        
                        try {
                            // Read the image file as a buffer
                            const imageBuffer = fs.readFileSync(thumbnailPath);
                            
                            // Set up the ID3 tags
                            const tags = {
                                image: {
                                    mime: 'image/jpeg',
                                    type: {
                                        id: 3,
                                        name: 'front cover'
                                    },
                                    description: 'Cover',
                                    imageBuffer: imageBuffer
                                }
                            };
                            
                            // Write tags to the file
                            const success = NodeID3.update(tags, audioOutputPath);
                            
                            if (success) {
                                console.log(`Successfully added metadata to ${sanitizedTitle}`);
                            } else {
                                console.error(`Failed to write ID3 tags to ${sanitizedTitle}`);
                            }
                        } catch (err) {
                            console.error(`Error adding metadata: ${err.message}`);
                            // Continue with other videos even if metadata addition fails
                        }
                    }

                    // Return successful result
                    return {
                        success: true,
                        filename: audioOutputPath,
                        videoTitle: video.title
                    };
                } catch (err) {
                    console.error(`Error processing video ${index + 1}: ${err.message}`);
                    return {
                        success: false,
                        error: err.message,
                        videoTitle: video.title
                    };
                }
            }

            // Process videos sequentially
            for (let i = 0; i < playlistData.videos.length; i++) {
                const result = await processVideo(playlistData.videos[i], i);
                results.push(result);

                // Update status after each video
                const successCount = results.filter(r => r.success).length;
                await statusMessage.edit(`Processed ${successCount}/${playlistData.videos.length} videos`);
            }
            
            // Create a zip object using node-zip
            const zip = new nodeZip();
            
            console.log(`Creating zip from files in ${downloadDir}`);
            
            // Add all downloaded song files to the zip directly from downloadDir
            try {
                const files = fs.readdirSync(downloadDir);
                console.log(`Found ${files.length} files in the directory`);
                
                let fileCount = 0;
                for (const file of files) {
                    const filePath = path.join(downloadDir, file);
                    if (fs.statSync(filePath).isFile() && path.extname(file).toLowerCase() === '.mp3') {
                        console.log(`Adding file to zip: ${file}`);
                        const fileData = fs.readFileSync(filePath);
                        zip.file(file, fileData);
                        fileCount++;
                    }
                }
                console.log(`Added ${fileCount} MP3 files to the zip`);
            } catch (err) {
                console.error(`Error creating zip: ${err.message}`);
            }
            
            // Generate the zip and write to file
            console.log('Generating zip file...');
            const zipFilename = path.join('temp', `${folderName}.zip`);
            const data = zip.generate({base64: false, compression: 'DEFLATE'});
            fs.writeFileSync(zipFilename, data, 'binary');
            console.log(`Zip file created at: ${zipFilename}`);
            
            // Final status update
            const successCount = results.filter(r => r.success).length;
            const zipStats = fs.statSync(zipFilename);
            const zipSizeMB = zipStats.size / (1024 * 1024);

            // Update final status message
            await statusMessage.edit(`Download complete: ${successCount}/${playlistData.videos.length} videos downloaded. Zip file size: ${zipSizeMB.toFixed(2)}MB`);

            // delete the folder
            fs.rmdirSync(downloadDir, { recursive: true });
            console.log(`Deleted temporary folder: ${downloadDir}`);

            // Send zip file or upload if too large
            if (zipSizeMB <= 10) {
                await message.channel.send({
                    files: [{
                        attachment: zipFilename,
                        name: path.basename(zipFilename)
                    }]
                });
                fs.rmSync(zipFilename, { force: true });
                console.log(`Zip file sent successfully: ${zipFilename}`);
            } else {
                // Implement large file upload logic here if needed
                await message.channel.send(`file is too big to send to Discord directly, it has been uploaded [here](${process.env.UPLOADURL}/${path.basename(zipFilename)})\nzip file will be deleted in 5 minutes.`);
                console.log(`Zip file is too large (${zipSizeMB.toFixed(2)}MB), uploaded to external service`);
                setTimeout(() => {
                    fs.rmSync(zipFilename, { force: true });
                    console.log(`Deleted zip file after 5 minutes: ${zipFilename}`);
                }, 5 * 60 * 1000); // 5 minutes
            }

            resolve({
                success: true,
                downloadCount: successCount,
                results: results,
                zipFilename: zipFilename
            });

        } catch (err) {
            console.error('Playlist download error:', err);
            // Update status message with error
            if (statusMessage) {
                await statusMessage.edit(`Download failed: ${err.message}`);
            }
            reject(err);
        }
    });
}

module.exports = { downloadPlaylist };