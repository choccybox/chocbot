const axios = require('axios');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const https = require('https');
const path = require('path');
const NodeID3 = require('node-id3');
const nodeZip = require('node-zip');
const ytdl = require('@distube/ytdl-core');

async function downloadPlaylist(message, tempFilePath, safeTitle) {
    return new Promise(async (resolve, reject) => {
        // read information from json file
        const playlistInfo = JSON.parse(fs.readFileSync(tempFilePath, 'utf8'));
        // use ytdl-core to download each video from the playlist as audio
        const failedDownloads = [];
        const downloadPromises = playlistInfo.videos.map(async (video) => {
            return new Promise(async (resolve, reject) => {
            const videoId = video.id || video.videoId || video.url || video.link;
            if (!videoId) {
                failedDownloads.push(video.title || videoId || 'Unknown');
                return resolve(null);
            }
            const videoTitle = video.title;
            const tempAudioPath = path.join(`temp/${safeTitle}`, `${videoTitle}_raw.mp3`);
            const outputPath = path.join(`temp/${safeTitle}`, `${videoTitle}.mp3`);

            // Download audio stream to a temporary file
            const audioStream = ytdl(videoId, { quality: 'highestaudio' });
            const tempAudioStream = fs.createWriteStream(tempAudioPath);

            audioStream.pipe(tempAudioStream);

            tempAudioStream.on('finish', async () => {
                // Convert to proper mp3 using ffmpeg
                ffmpeg(tempAudioPath)
                .audioCodec('libmp3lame')
                .format('mp3')
                .on('end', async () => {
                    // Prepare ID3 tags
                    const tags = {
                    title: video.title,
                    artist: playlistInfo.artist,
                    album: playlistInfo.title,
                    year: playlistInfo.year,
                    genre: playlistInfo.genre,
                    TRCK: video.number,
                    TPE2: playlistInfo.artist
                    };

                    // Try to add front cover if available
                    let coverUrl = video.thumbnailUrl || video.thumbnail || (video.thumbnails && video.thumbnails[0] && video.thumbnails[0].url);
                    let coverPath, croppedCoverPath;
                    if (coverUrl) {
                    try {
                        // Download the cover image using axios
                        const response = await axios.get(coverUrl, { responseType: 'arraybuffer' });
                        coverPath = path.join(`temp/${safeTitle}`, `${videoTitle}_cover.jpg`);
                        fs.writeFileSync(coverPath, response.data);

                        // Get image dimensions using ffmpeg
                        const getImageDimensions = (filePath) => {
                        return new Promise((resolve, reject) => {
                            ffmpeg.ffprobe(filePath, (err, metadata) => {
                            if (err) return reject(err);
                            const { width, height } = metadata.streams[0];
                            resolve({ width, height });
                            });
                        });
                        };

                        const dimensions = await getImageDimensions(coverPath);
                        const size = Math.min(dimensions.width, dimensions.height);
                        croppedCoverPath = path.join(`temp/${safeTitle}`, `${videoTitle}_cover_cropped.jpg`);

                        // Crop the image into a square using ffmpeg
                        await new Promise((res, rej) => {
                        ffmpeg(coverPath)
                            .outputOptions([
                            `-vf crop=${size}:${size}`
                            ])
                            .on('end', res)
                            .on('error', rej)
                            .save(croppedCoverPath);
                        });

                        // Read cropped image as buffer
                        const imageBuffer = fs.readFileSync(croppedCoverPath);

                        tags.image = {
                        mime: 'image/jpeg',
                        type: {
                            id: 3,
                            name: 'front cover'
                        },
                        description: 'Front cover',
                        imageBuffer
                        };

                        // Clean up cover images after tagging
                        fs.unlinkSync(coverPath);
                        fs.unlinkSync(croppedCoverPath);

                    } catch (err) {
                        console.warn(`Could not fetch or crop cover image for ${video.title}:`, err.message);
                        // Clean up if partially created
                        if (coverPath && fs.existsSync(coverPath)) fs.unlinkSync(coverPath);
                        if (croppedCoverPath && fs.existsSync(croppedCoverPath)) fs.unlinkSync(croppedCoverPath);
                    }
                    }

                    NodeID3.write(tags, outputPath, (err) => {
                    // Clean up temp audio file
                    if (fs.existsSync(tempAudioPath)) fs.unlinkSync(tempAudioPath);
                    if (err) {
                        console.error(`Error writing ID3 tags for ${video.title}:`, err);
                        failedDownloads.push(video.title || videoId || 'Unknown');
                        return resolve(null);
                    }
                    resolve(outputPath);
                    });
                })
                .on('error', (err) => {
                    if (fs.existsSync(tempAudioPath)) fs.unlinkSync(tempAudioPath);
                    console.error(`Error converting ${video.title || videoId} to mp3:`, err);
                    failedDownloads.push(video.title || videoId || 'Unknown');
                    resolve(null);
                })
                .save(outputPath);
            });

            tempAudioStream.on('error', (err) => {
                if (fs.existsSync(tempAudioPath)) fs.unlinkSync(tempAudioPath);
                console.error(`Error downloading ${video.title || videoId}:`, err);
                failedDownloads.push(video.title || videoId || 'Unknown');
                resolve(null);
            });
            });
        });
        // wait for all downloads to finish
        const downloadedFiles = await Promise.all(downloadPromises).catch((err) => {
            console.error('Error downloading playlist:', err);
            reject(err);
        });
        // create zip file
        const zip = nodeZip();
        downloadedFiles.forEach((filePath) => {
            const fileName = path.basename(filePath);
            zip.file(fileName, fs.readFileSync(filePath));
        });
        // generate zip buffer and write to file
        const zipData = zip.generate({ base64: false, compression: 'DEFLATE' });
        const zipFileName = `${playlistInfo.title}.zip`;
        const zipFilePath = path.join('temp', zipFileName);
        fs.writeFileSync(zipFilePath, zipData, 'binary');
        // once zipped, delete the entire directory except the zip file
        fs.rm(`temp/${safeTitle}`, { recursive: true, force: true }, (err) => {
            if (err) {
            console.error('Error deleting temp directory:', err);
            return reject(err);
            }
        });
        // set response to true and include zip path
        resolve({
            success: true
        });
    });
}

module.exports = { downloadPlaylist };