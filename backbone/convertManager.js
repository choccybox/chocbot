const axios = require('axios');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');

const conversionFunctions = {
    png: convertFile,
    jpg: convertFile,
    jpeg: convertFile,
    gif: convertToGIF,
    webp: convertFile,
    svg: convertFile,
    heic: convertFile,
    mp3: convertFile,
    wav: convertFile,
    flac: convertFile,
    ogg: convertFile,
    aac: convertFile,
    m4a: convertFile,
    opus: convertFile,
    wma: convertFile,
    mp4: convertFile,
    avi: convertFile,
    mov: convertFile,
    wmv: convertFile,
    mkv: convertFile,
    webm: convertFile,
    flv: convertFile,
    mpeg: convertFile,
    mpg: convertFile,
    "3gp": convertFile
};

async function conversionDecider(message, filePath, outputFilePath, conversionFormat) {
    return new Promise(async (resolve, reject) => {
        try {
            const convertFunction = conversionFunctions[conversionFormat.toLowerCase()];
            const fileExtension = path.extname(filePath).toLowerCase().slice(1);

            // Check if the conversion is valid
            const validConversions = {
                image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'heic'],
                audio: ['mp3', 'wav', 'flac', 'ogg', 'aac', 'm4a', 'opus', 'wma'],
                video: ['mp4', 'avi', 'mov', 'wmv', 'mkv', 'webm', 'flv', 'mpeg', 'mpg', '3gp']
            };

            // Define valid cross-type conversions
            const validCrossConversions = {
                video: ['gif', ...validConversions.audio, ...validConversions.video], // video can be converted to gif, audio, or any video format
                audio: validConversions.audio, // audio can be converted to any audio format
                image: ['gif', ...validConversions.image] // images can be converted to gif or any image format
            };

            const getMediaType = (format) => {
                if (validConversions.image.includes(format)) return 'image';
                if (validConversions.audio.includes(format)) return 'audio';
                if (validConversions.video.includes(format)) return 'video';
                return null;
            };

            const sourceType = getMediaType(fileExtension);
            const targetFormat = conversionFormat.toLowerCase();

            if (sourceType && validCrossConversions[sourceType].includes(targetFormat)) {
                if (convertFunction) {
                    try {
                        const { sizeChangeDirection, sizeDifferencePercentage, originalSize, newSize, sizeDifferenceBits } = await convertFunction(filePath, outputFilePath, conversionFormat);
                        resolve({ success: true, convertedFile: outputFilePath, sizeChangeDirection, sizeDifferencePercentage, originalSize, newSize, sizeDifferenceBits });
                    } catch (error) {
                        console.error(`Error converting to ${conversionFormat.toUpperCase()}:`, error);
                        resolve({ success: false, message: `Conversion to ${conversionFormat.toUpperCase()} failed.` });
                    }
                } else {
                    resolve({ success: false, message: 'Unsupported conversion format.' });
                }
            } else {
                message.reactions.removeAll().catch(console.error);
                resolve({ success: false, message: `Conversion from ${fileExtension.toUpperCase()} to ${conversionFormat.toUpperCase()} is not possible.` });
            }
        } catch (error) {
            console.error('Error in conversionDecider:', error);
            reject({ success: false, message: 'An error occurred during conversion.' });
        }
    });
}

const conversionSettings = {
    JPG: { format: 'image2', codec: 'mjpeg', options: ['-q:v', '2'] },
    JPEG: { format: 'image2', codec: 'mjpeg', options: ['-q:v', '2'] },
    PNG: { format: 'image2', codec: 'png', options: ['-compression_level', '2'] },
    WEBP: { format: 'image2', codec: 'libwebp', options: ['-compression_level', '6', '-q:v', '75'] },
    SVG: { format: 'image2', codec: 'svg', options: [] },
    HEIC: { format: 'image2', codec: 'hevc', options: ['-compression_level', '2'] },
    MP3: { format: 'mp3', codec: 'libmp3lame', options: ['-b:a', '320k'] },
    WAV: { format: 'wav', codec: 'pcm_s16le', options: [] },
    FLAC: { format: 'flac', codec: 'flac', options: [] },
    OGG: { format: 'ogg', codec: 'libvorbis', options: [] },
    AAC: { format: 'adts', codec: 'aac', options: [] },
    M4A: { format: 'ipod', codec: 'aac', options: [] },
    OPUS: { format: 'opus', codec: 'libopus', options: [] },
    WMA: { format: 'asf', codec: 'wmav2', options: [] },
    MP4: { format: 'mp4', codec: 'libx264', options: ['-crf', '23'] },
    AVI: { format: 'avi', codec: 'mpeg4', options: ['-q:v', '5'] },
    MOV: { format: 'mov', codec: 'h264', options: ['-crf', '23'] },
    WMV: { format: 'asf', codec: 'wmv2', options: ['-b:v', '1000k'] },
    MKV: { format: 'matroska', codec: 'libx264', options: ['-crf', '23'] },
    WEBM: { format: 'webm', codec: 'libvpx', options: ['-crf', '23'] },
    FLV: { format: 'flv', codec: 'libx264', options: ['-crf', '23'] },
    MPEG: { format: 'mpeg', codec: 'mpeg2video', options: ['-q:v', '5'] },
    MPG: { format: 'mpeg', codec: 'mpeg2video', options: ['-q:v', '5'] },
    "3GP": { format: '3gp', codec: 'libx264', options: ['-crf', '23'] }
};

async function convertFile(filePath, outputFilePath, conversionFormat) {
    console.log(`Converting ${filePath} to ${conversionFormat}...`);
    return new Promise((resolve, reject) => {
        const settings = conversionSettings[conversionFormat.toUpperCase()];
        if (!settings) {
            return reject(new Error(`Unsupported format: ${conversionFormat}`));
        }

        const command = ffmpeg(filePath)
            .toFormat(settings.format)
            .outputOptions('-vcodec', settings.codec)
            .outputOptions(settings.options);

        command
            .on('end', async () => {
                try {
                    const originalSize = (await fs.promises.stat(filePath)).size;
                    const newSize = (await fs.promises.stat(outputFilePath)).size;
                    const sizeDifference = Math.abs(originalSize - newSize);
                    const sizeDifferencePercentage = ((sizeDifference / originalSize) * 100).toFixed(2);
                    const sizeDifferenceBits = newSize - originalSize;
                    const sizeChangeDirection = newSize > originalSize ? '+' : '-';

                    console.log(`Conversion to ${conversionFormat} completed successfully.`);
                    console.log(`Original size: ${(originalSize / 1024).toFixed(2)} KB`);
                    console.log(`New size: ${(newSize / 1024).toFixed(2)} KB`);
                    console.log(`Size difference: ${sizeChangeDirection}${(sizeDifference / 1024).toFixed(2)} KB (${sizeChangeDirection}${sizeDifferencePercentage}%)`);
                    resolve({ sizeChangeDirection, sizeDifferencePercentage, originalSize, newSize, sizeDifferenceBits });
                } catch (statError) {
                    console.error('Error retrieving file size information:', statError);
                    reject(statError);
                }
            })
            .on('error', (err) => {
                console.error(`Error during conversion to ${conversionFormat}:`, err);
                reject(err);
            })
            .save(outputFilePath);
    });
}

async function convertToGIF(filePath, outputFilePath) {
    console.log(`Converting ${filePath} to GIF...`);
    return new Promise(async (resolve, reject) => {
        try {
            // check what file format it is
            const fileFormat = path.extname(filePath).toLowerCase().slice(1);
            console.log(`File format: ${fileFormat}`);

            if (fileFormat === 'gif') {
                console.log('File is already a GIF. No conversion needed.');
                return resolve({ success: true, convertedFile: filePath });
            } else if (fileFormat === 'jpeg' || fileFormat === 'jpg' || fileFormat === 'png' || fileFormat === 'webp' || fileFormat === 'svg' || fileFormat === 'heic') {
                console.log('File is an image. Converting to GIF...');

                console.log('File is an image. Converting to a high-quality GIF with one frame.');
                ffmpeg(filePath)
                    .toFormat('gif')
                    .outputOptions(['-y', '-compression_level', '6'])
                    .outputOptions('-vf', `split[s0][s1];[s0]palettegen=max_colors=256[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5`)
                    .on('end', async () => {
                        try {
                            const originalSize = (await fs.promises.stat(filePath)).size;
                            const newSize = (await fs.promises.stat(outputFilePath)).size;
                            const sizeDifference = Math.abs(originalSize - newSize);
                            const sizeDifferencePercentage = ((sizeDifference / originalSize) * 100).toFixed(2);
                            const sizeDifferenceBits = newSize - originalSize;
                            const sizeChangeDirection = newSize > originalSize ? '+' : '-';

                            console.log('Conversion to GIF completed successfully.');
                            console.log(`Original size: ${(originalSize / 1024).toFixed(2)} KB`);
                            console.log(`New size: ${(newSize / 1024).toFixed(2)} KB`);
                            console.log(`Size difference: ${sizeChangeDirection}${(sizeDifference / 1024).toFixed(2)} KB (${sizeChangeDirection}${sizeDifferencePercentage}%)`);
                            resolve({ sizeChangeDirection, sizeDifferencePercentage, originalSize, newSize, sizeDifferenceBits });
                        } catch (statError) {
                            console.error('Error retrieving file size information:', statError);
                            reject(statError);
                        }
                    })
                    .on('error', (err) => {
                        console.error('Error during conversion:', err);
                        reject(err);
                    })
                    .save(outputFilePath);
                }
            else {
                // Use ffprobe to get the metadata of the file
                const metadata = await new Promise((resolve, reject) => {
                    ffmpeg.ffprobe(filePath, (err, data) => {
                        if (err) {
                            console.error('Error getting file metadata:', err);
                            reject(err);
                        } else {
                            resolve(data);
                        }
                    });
                });

                console.log(`File is a video. Duration: ${metadata.format.duration} seconds`);

                if (metadata.format.duration > 60) {
                    console.error('Video duration exceeds 60 seconds.');
                    return reject(new Error('Video duration exceeds 60 seconds.'));
                }

                const durfpstable = [
                    [10, 20],
                    [18, 15],
                    [24, 10],
                    [30, 8],
                    [60, 8]
                ];

                ffmpeg(filePath)
                    .toFormat('gif')
                    .outputOptions(['-y', '-compression_level', '6'])
                    .fps(durfpstable.find(([dur]) => metadata.format.duration < dur)[1])
                    .outputOptions('-vf', `split[s0][s1];[s0]palettegen=max_colors=256[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5`)
                    .on('end', async () => {
                        try {
                            const originalSize = (await fs.promises.stat(filePath)).size;
                            const newSize = (await fs.promises.stat(outputFilePath)).size;
                            const sizeDifference = Math.abs(originalSize - newSize);
                            const sizeDifferencePercentage = ((sizeDifference / originalSize) * 100).toFixed(2);
                            const sizeDifferenceBits = newSize - originalSize;
                            const sizeChangeDirection = newSize > originalSize ? '+' : '-';

                            console.log('Conversion to GIF completed successfully.');
                            console.log(`Original size: ${(originalSize / 1024).toFixed(2)} KB`);
                            console.log(`New size: ${(newSize / 1024).toFixed(2)} KB`);
                            console.log(`Size difference: ${sizeChangeDirection}${(sizeDifference / 1024).toFixed(2)} KB (${sizeChangeDirection}${sizeDifferencePercentage}%)`);
                            resolve({ sizeChangeDirection, sizeDifferencePercentage, originalSize, newSize, sizeDifferenceBits });
                        } catch (statError) {
                            console.error('Error retrieving file size information:', statError);
                            reject(statError);
                        }
                    })
                    .on('error', (err) => {
                        console.error('Error during conversion:', err);
                        reject(err);
                    })
                    .save(outputFilePath);
            }
        } catch (error) {
            console.error('Error in convertToGIF:', error);
            reject(error);
        }
    });
}

module.exports = { conversionDecider };