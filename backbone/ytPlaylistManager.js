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
            let videosToProcess = [];
            
            try {
                const parsedData = JSON.parse(tempFile);
                
                // Handle both array format and single video format
                if (Array.isArray(parsedData)) {
                    videosToProcess = parsedData;
                } else if (parsedData.shortUrl) {
                    videosToProcess = [parsedData];
                } else if (parsedData.videos && Array.isArray(parsedData.videos)) {
                    videosToProcess = parsedData.videos;
                } else {
                    throw new Error('Unrecognized JSON structure');
                }
            } catch (err) {
                throw new Error('Failed to parse playlist data as JSON: ' + err.message);
            }

            // Validate videos
            if (videosToProcess.length === 0) {
                throw new Error('No videos found in the playlist data');
            }

            // Ensure temp directory exists
            const fileNameWithExtension = path.basename(tempFilePath);
            const folderName = fileNameWithExtension.slice(0, -11);
            const downloadDir = `temp/${folderName}`;
            fs.mkdirSync(downloadDir, { recursive: true });

            console.log(`Preparing to download ${videosToProcess.length} videos`);

            // Initial status message
            let statusMessage = await message.reply(`Preparing to download ${videosToProcess.length} videos...`);

            // Results array to track downloads
            const results = [];
            let totalSuccessCount = 0;
            let errorCount = 0;
            
            // Track errors for display
            const errors = [];
            
            // Object to track progress of currently downloading files
            const downloadProgress = {};
            
            // Create a function to update status message with progress
            const updateStatusInterval = 3000; // 3 seconds
            let statusUpdateTimer = null;
            
            // Format progress bar function
            function createProgressBar(percent, length = 20) {
                const filledLength = Math.round(length * percent / 100);
                const bar = '█'.repeat(filledLength) + '░'.repeat(length - filledLength);
                return `[${bar}] ${percent.toFixed(1)}%`;
            }
            
            // Start a timer to track total download time
            const startTime = Date.now();
            
            async function updateStatusMessage() {
                try {
                    // Show progress for current downloads first
                    let statusText = "";
                    
                    if (Object.keys(downloadProgress).length > 0) {
                        statusText += `📥 Downloading:\n\n`;
                        Object.entries(downloadProgress).forEach(([title, progress]) => {
                            const progressBar = createProgressBar(progress.percent);
                            statusText += `${title}: ${progressBar}\n`;
                        });
                        statusText += `\n`;
                    }
                    
                    // Calculate elapsed time
                    const elapsedSecs = (Date.now() - startTime) / 1000;
                    let timeStr = '';
                    
                    if (elapsedSecs < 60) {
                        timeStr = `${Math.floor(elapsedSecs)}s`;
                    } else if (elapsedSecs < 3600) {
                        const mins = Math.floor(elapsedSecs / 60);
                        const secs = Math.floor(elapsedSecs % 60);
                        timeStr = `${mins}m ${secs}s`;
                    } else {
                        const hours = Math.floor(elapsedSecs / 3600);
                        const mins = Math.floor((elapsedSecs % 3600) / 60);
                        const secs = Math.floor(elapsedSecs % 60);
                        timeStr = `${hours}h ${mins}m ${secs}s`;
                    }
                    
                    // Add time info
                    statusText += `⏱️ Elapsed time: ${timeStr}\n`;
                    
                    // Calculate folder size (MP3 files only)
                    let folderSizeMB = 0;
                    try {
                        if (fs.existsSync(downloadDir)) {
                            const files = fs.readdirSync(downloadDir);
                            for (const file of files) {
                                if (file.toLowerCase().endsWith('.mp3')) {
                                    const filePath = path.join(downloadDir, file);
                                    const stats = fs.statSync(filePath);
                                    folderSizeMB += stats.size / (1024 * 1024);
                                }
                            }
                            statusText += `📦 Current folder size: ${folderSizeMB.toFixed(1)}MB\n` + 
                              `🔄 Progress: ${totalSuccessCount}/${videosToProcess.length - errorCount} completed` +
                              (errorCount > 0 ? `, ${errorCount} failed` : ``);
                        }
                    } catch (err) {
                        console.error(`Error getting folder size: ${err.message}`);
                    }
                    
                    // Add error information if any
                    if (errors.length > 0) {
                        statusText += `\n⚠️ ${errors.length === 1 ? 'Error' : 'Errors'} (${errors.length}): *${errors.length === 1 ? 'This error may' : 'These errors may'} be due to mentioned songs being age restricted or issue on cobalt api.*\n`;
                        // Show last 5 errors to avoid message being too long
                        const recentErrors = errors.slice(-5);
                        recentErrors.forEach(error => {
                            statusText += `- ${error.title.slice(0, 25)}${error.title.length > 25 ? '...' : ''}: ${error.message}\n`;
                        });
                        
                        if (errors.length > 5) {
                            statusText += `...and ${errors.length - 5} more ${errors.length - 5 === 1 ? 'error' : 'errors'}\n`;
                        }
                    }
                    
                    await statusMessage.edit(statusText);
                } catch (err) {
                    console.error(`Error updating status message: ${err.message}`);
                }
            }
            
            // Start periodic status updates
            statusUpdateTimer = setInterval(updateStatusMessage, updateStatusInterval);

            // Process a single video
            async function processVideo(video, index) {
                try {
                    // Update status in console
                    console.log(`Processing video ${index + 1}/${videosToProcess.length}: ${video.title}`);

                    // Get download URL from Cobalt API
                    const response = await axios({
                        method: 'POST',
                        url: process.env.COBALTAPI,
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
                    let downloadURL, filename, contentLength;
                    if (response.data.status === 'redirect' || response.data.status === 'tunnel') {
                        downloadURL = response.data.url;
                        filename = response.data.filename;
                        contentLength = response.data.audio?.sizeBytes || 0;
                    } 
                    else if (response.data.status === 'picker' && response.data.picker?.length > 0) {
                        downloadURL = response.data.picker[0].url;
                        filename = response.data.picker[0].filename || 'unknown';
                        contentLength = response.data.picker[0].sizeBytes || 0;
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

                    // Initialize progress tracking for this file
                    downloadProgress[sanitizedTitle] = {
                        percent: 0,
                        bytesDownloaded: 0,
                        totalBytes: contentLength || 0,
                        startTime: Date.now()
                    };

                    // Download audio file with progress tracking
                    const audioResponse = await axios({
                        method: 'get',
                        url: downloadURL,
                        responseType: 'stream',
                        onDownloadProgress: (progressEvent) => {
                            if (progressEvent.total) {
                                downloadProgress[sanitizedTitle].totalBytes = progressEvent.total;
                            }
                            downloadProgress[sanitizedTitle].bytesDownloaded = progressEvent.loaded;
                            const percent = progressEvent.total 
                                ? (progressEvent.loaded / progressEvent.total) * 100 
                                : estimateProgressByTime(downloadProgress[sanitizedTitle]);
                            downloadProgress[sanitizedTitle].percent = Math.min(percent, 99.9); // Cap at 99.9% until complete
                        }
                    });

                    // If content length is available from the header, use it
                    const contentLengthHeader = audioResponse.headers['content-length'];
                    if (contentLengthHeader && !downloadProgress[sanitizedTitle].totalBytes) {
                        downloadProgress[sanitizedTitle].totalBytes = parseInt(contentLengthHeader);
                    }

                    // Function to estimate progress by elapsed time and downloaded bytes when content length is unknown
                    function estimateProgressByTime(progressData) {
                        const elapsedSeconds = (Date.now() - progressData.startTime) / 1000;
                        const bytesDownloaded = progressData.bytesDownloaded;
                        
                        // Average MP3 file size at 320kbps is ~2.4MB per minute of audio
                        // Estimate a 4-minute song (~10MB) as baseline
                        const estimatedTotalSize = 10 * 1024 * 1024;
                        
                        // Use sigmoid-like function for smoother progression
                        // Maps time to a 0-1 range with a natural S-curve
                        const timeBasedProgress = 100 * (1 / (1 + Math.exp(-0.15 * (elapsedSeconds - 25))));
                        
                        // If we have bytes downloaded, use that for a better estimate
                        let bytesBasedProgress = 0;
                        if (bytesDownloaded > 0) {
                            // Estimate progress based on downloaded bytes and estimated file size
                            // Cap at 95% to avoid appearing complete too early
                            bytesBasedProgress = Math.min(95, (bytesDownloaded / estimatedTotalSize) * 100);
                        }
                        
                        // Combine the two estimates, giving more weight to bytes-based estimate as we progress
                        const bytesWeight = Math.min(0.8, elapsedSeconds / 60); // Increasing weight up to 80%
                        const timeWeight = 1 - bytesWeight;
                        
                        let estimatedProgress = (bytesWeight * bytesBasedProgress) + (timeWeight * timeBasedProgress);
                        
                        // Cap at 99% until we know it's complete
                        return Math.min(99, Math.max(5, estimatedProgress));
                    }

                    const audioWriter = fs.createWriteStream(audioOutputPath);
                    audioResponse.data.pipe(audioWriter);

                    // Add progress tracking to the stream
                    let lastReportedBytes = 0;
                    audioResponse.data.on('data', (chunk) => {
                        lastReportedBytes += chunk.length;
                        if (downloadProgress[sanitizedTitle]) {
                            downloadProgress[sanitizedTitle].bytesDownloaded = lastReportedBytes;
                            
                            // If we couldn't get content length from headers, estimate
                            if (!downloadProgress[sanitizedTitle].totalBytes || downloadProgress[sanitizedTitle].totalBytes === 0) {
                                const percent = estimateProgressByTime(downloadProgress[sanitizedTitle]);
                                downloadProgress[sanitizedTitle].percent = percent;
                            } else {
                                downloadProgress[sanitizedTitle].percent = 
                                    (lastReportedBytes / downloadProgress[sanitizedTitle].totalBytes) * 100;
                            }
                        }
                    });

                    // Wait for audio download to complete
                    await new Promise((resolveDownload, rejectDownload) => {
                        audioWriter.on('finish', resolveDownload);
                        audioWriter.on('error', rejectDownload);
                    });

                    // Mark as 100% when complete
                    if (downloadProgress[sanitizedTitle]) {
                        downloadProgress[sanitizedTitle].percent = 100;
                    }
                    
                    console.log(`Downloaded ${sanitizedTitle} successfully.`);
                    
                    // Remove from progress tracking after a short delay to show 100%
                    setTimeout(() => {
                        delete downloadProgress[sanitizedTitle];
                    }, 3000);

                    // Thumbnail processing
                    let thumbnailPath = null;
                    if (video.thumbnail) {
                        console.log(`Processing thumbnail for ${sanitizedTitle}...`);
                        const thumbnailUrl = video.thumbnail;
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
                        videoTitle: video.title,
                        index: index
                    };
                } catch (err) {
                    console.error(`Error processing video ${index + 1}: ${err.message}`);
                    
                    // Remove from progress tracking if error occurs
                    const sanitizedTitle = sanitizeFilename(video.title || 'unknown');
                    if (downloadProgress[sanitizedTitle]) {
                        delete downloadProgress[sanitizedTitle];
                    }
                    
                    // Track error for display in status message
                    errors.push({
                        title: video.title || 'Unknown video',
                        message: err.message,
                        index
                    });
                    
                    errorCount++;
                    
                    // Force a status update to show the error
                    updateStatusMessage();
                    
                    return {
                        success: false,
                        error: err.message,
                        videoTitle: video.title,
                        index: index
                    };
                }
            }

            // Process videos with a rolling window of 10 concurrent downloads
            const MAX_CONCURRENT = 6;
            const queue = [...videosToProcess];
            const activeDownloads = new Set();
            const downloadPromises = [];
            
            // Function to start a new download if queue has items and we're below max concurrent
            async function startNextDownload() {
                if (queue.length === 0 || activeDownloads.size >= MAX_CONCURRENT) return;
                
                const video = queue.shift();
                const index = videosToProcess.indexOf(video);
                
                // Mark as active
                activeDownloads.add(index);
                
                // Start the download
                const downloadPromise = processVideo(video, index)
                    .then(result => {
                        // Remove from active set when done
                        activeDownloads.delete(index);
                        
                        // Count successes
                        if (result.success) {
                            totalSuccessCount++;
                        }
                        
                        // Add to results
                        results.push(result);
                        
                        // Start next download if available
                        return startNextDownload();
                    })
                    .catch(err => {
                        console.error(`Unexpected error in download process: ${err.message}`);
                        activeDownloads.delete(index);
                        return startNextDownload();
                    });
                
                downloadPromises.push(downloadPromise);
            }
            
            // Start initial batch of downloads (up to MAX_CONCURRENT)
            for (let i = 0; i < Math.min(MAX_CONCURRENT, videosToProcess.length); i++) {
                await startNextDownload();
            }
            
            // Wait for all downloads to complete
            await Promise.all(downloadPromises);
            
            // Clear the status update timer
            if (statusUpdateTimer) {
                clearInterval(statusUpdateTimer);
                statusUpdateTimer = null;
            }
            
            // Create a zip file with all downloaded songs
            console.log(`Creating zip from files in ${downloadDir}`);
            await statusMessage.edit(`All downloads complete: ${totalSuccessCount} successful, ${errorCount} failed. Creating zip file...`);
            
            const zip = new nodeZip();
            
            // Add all downloaded song files to the zip
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
            await statusMessage.edit(`Compressing ${totalSuccessCount} songs into a zip file...`);
            
            const zipFilename = path.join('temp', `${folderName}.zip`);
            const data = zip.generate({base64: false, compression: 'DEFLATE'});
            fs.writeFileSync(zipFilename, data, 'binary');
            console.log(`Zip file created at: ${zipFilename}`);
            
            // Calculate stats
            const zipStats = fs.statSync(zipFilename);
            const zipSizeMB = zipStats.size / (1024 * 1024);
            
            // Final status update
            let finalStatus = `Download complete: ${totalSuccessCount}/${videosToProcess.length} videos downloaded`;
            if (errorCount > 0) {
                finalStatus += `, ${errorCount} failed`;
            }
            finalStatus += `. Zip file size: ${zipSizeMB.toFixed(2)}MB`;
            
            await statusMessage.edit(finalStatus);
            
            // Create error report file if there were errors
            let errorFilePath;
            if (errors.length > 0) {
                errorFilePath = path.join('temp', `${folderName}_errors.txt`);
                let errorReport = `Error Report - ${errors.length} videos failed to download:\n\n`;
                errors.forEach((error, index) => {
                    errorReport += `${index + 1}. ${error.title}: ${error.message}\n`;
                });
                fs.writeFileSync(errorFilePath, errorReport, 'utf8');
                console.log(`Created error report at: ${errorFilePath}`);
            }

            // Calculate total time taken
            const endTime = Date.now();
            const totalTimeInSeconds = (endTime - startTime) / 1000;
            let timeStr = '';
            
            if (totalTimeInSeconds < 60) {
                timeStr = `${Math.floor(totalTimeInSeconds)}s`;
            } else if (totalTimeInSeconds < 3600) {
                const mins = Math.floor(totalTimeInSeconds / 60);
                const secs = Math.floor(totalTimeInSeconds % 60);
                timeStr = `${mins}m ${secs}s`;
            } else {
                const hours = Math.floor(totalTimeInSeconds / 3600);
                const mins = Math.floor((totalTimeInSeconds % 3600) / 60);
                const secs = Math.floor(totalTimeInSeconds % 60);
                timeStr = `${hours}h ${mins}m ${secs}s`;
            }

            // Send zip file or upload if too large
            if (zipSizeMB <= 10) {
                const attachments = [{
                    attachment: zipFilename,
                    name: path.basename(zipFilename)
                }];
                
                // Add error file if exists
                if (errorFilePath) {
                    attachments.push({
                        attachment: errorFilePath,
                        name: `error_report.txt`
                    });
                }
                
                await message.channel.send({
                    content: `⌚ Time taken: ${timeStr}.\n📦 Size: ${zipSizeMB.toFixed(2)}MB with ${totalSuccessCount} songs.${errors.length > 0 ? ` ${errors.length} errors occurred. See attached error report.` : ''}`,
                    files: attachments
                });
                
                fs.rmSync(zipFilename, { force: true });
                console.log(`Zip file sent successfully: ${zipFilename}`);
                
                // Clean up error file
                if (errorFilePath) {
                    fs.rmSync(errorFilePath, { force: true });
                }
            } else {
                // Large file upload logic
                const encodedFilename = path.basename(zipFilename).replace(/ /g, '%20');
                
                // Send message with error report if exists
                if (errorFilePath) {
                    await message.channel.send({
                        content: `⌚ Time taken: ${timeStr}.\n📦 Size: ${zipSizeMB.toFixed(2)}MB with ${totalSuccessCount} songs.\nFile is too big to send to Discord directly, it has been uploaded [here](${process.env.UPLOADURL}/temp/${encodedFilename})\nZip file will be deleted in 5 minutes.${errors.length > 0 ? `\n${errors.length} videos failed to download. See attached error report.` : ''}`,
                        files: [{
                            attachment: errorFilePath,
                            name: `error_report.txt`
                        }]
                    });
                    
                    // Clean up error file
                    fs.rmSync(errorFilePath, { force: true });
                } else {
                    await message.channel.send(`⌚ Time taken: ${timeStr}.\n📦 Size: ${zipSizeMB.toFixed(2)}MB with ${totalSuccessCount} songs.\nFile is too big to send to Discord directly, it has been uploaded [here](${process.env.UPLOADURL}/temp/${encodedFilename})\nZip file will be deleted in 5 minutes.`);
                }
                
                console.log(`Zip file is too large (${zipSizeMB.toFixed(2)}MB), uploaded to external service`);
                
                // Schedule deletion after 5 minutes
                setTimeout(() => {
                    fs.rmSync(zipFilename, { force: true });
                    console.log(`Deleted zip file after 5 minutes: ${zipFilename}`);
                }, 5 * 60 * 1000); // 5 minutes
            }
            
            // Clean up download directory and temp file
            fs.rmdirSync(downloadDir, { recursive: true });
            console.log(`Deleted temporary folder: ${downloadDir}`);
            
            setTimeout(() => {
                fs.rmSync(tempFilePath, { force: true });
                console.log(`Deleted JSON file: ${tempFilePath}`);
            }, 5 * 60 * 1000); // 5 minutes
            
            resolve({
                success: true,
                downloadCount: totalSuccessCount,
                errorCount: errorCount,
                results: results,
                errors: errors,
                zipFilename: zipFilename
            });

        } catch (err) {
            console.error('Playlist download error:', err);
            reject(err);
        }
    });
}

module.exports = { downloadPlaylist };