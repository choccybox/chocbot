const altnames = ['speechbubble', 'spchb', 'sb', 'speech', 'spch']
const quickdesc = 'adds a speechbubble, supports images and videos';

const dotenv = require('dotenv');
dotenv.config();
const fs = require('fs');
const axios = require('axios');
const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');

module.exports = {
    run: async function handleMessage(message, client, currentAttachments, isChained) {
        if (message.content.includes('help')) {
            return message.reply({
                content: `**adds a speechbubble on top of an image/video**\n` +
                    `**Usage: ${altnames.join(', ')}\n`
            });
        }
        const hasAttachment = currentAttachments || message.attachments;
        const firstAttachment = hasAttachment.first();
        const isVideo = firstAttachment && firstAttachment.contentType.includes('video') || firstAttachment.contentType.includes('image');
        if (!isVideo) {
            return message.reply({ content: 'provide a video file to convert.' });
        } else {
            const attachment = firstAttachment;
            const fileUrl = attachment.url;
            const userName = message.author.id;
            const contentType = attachment.contentType.split('/')[1];
            const rnd5dig = Math.floor(Math.random() * 90000) + 10000;

            const downloadFile = await axios.get(fileUrl, { responseType: 'arraybuffer' });
            const fileData = downloadFile.data;
            let originalAttachmentPath = `temp/${userName}-TOSPCHCONV-${rnd5dig}.${contentType}`;
            await fs.writeFileSync(originalAttachmentPath, fileData);

            // Check if file is a GIF and convert to MP4 if needed
            if (firstAttachment.contentType.includes('gif')) {
                const gifToMp4 = `temp/${userName}-TOSPCHCONV-${rnd5dig}.mp4`;
                await new Promise((resolve, reject) => {
                    ffmpeg(originalAttachmentPath)
                    .toFormat('mp4')
                    .outputOptions('-movflags faststart')
                    .output(gifToMp4)
                    .on('end', () => {
                        fs.unlinkSync(originalAttachmentPath);
                        resolve(gifToMp4);
                    })
                    .on('error', reject)
                    .run();
                });
                originalAttachmentPath = gifToMp4;
            } else {
                originalAttachmentPath = `temp/${userName}-TOSPCHCONV-${rnd5dig}.${contentType}`;
            }

            const { width, height, duration } = await new Promise((resolve, reject) => {
                ffmpeg.ffprobe(`temp/${userName}-TOSPCHCONV-${rnd5dig}.${contentType}`, (err, metadata) => {
                    if (err) return reject(err);
                    const stream = metadata.streams.find(s => s.width) || metadata.streams.find(s => s.duration) || metadata.streams.find(s => s.height);
                    if (stream) {
                        resolve({
                            duration: stream.duration && contentType.includes('mp4') ? stream.duration : 0,
                            width: stream.width,
                            height: Math.floor(stream.height * 0.25),
                        });
                    } else {
                        reject(new Error('No stream metadata found'));
                    }
                });
            });
            console.log('width:', width, 'height:', height, 'duration:', duration);

            try {
                message.react('<a:pukekospin:1311021344149868555>').catch(() => message.react('👍'));
                await convertToGIF(userName, originalAttachmentPath, contentType, rnd5dig, width, height, duration);
                message.reply({ files: [`temp/${userName}-SPCHFINAL-${rnd5dig}.gif`] });
                message.reactions.removeAll().catch(console.error);
            } catch (err) {
                console.error('Error:', err);
                return message.reply({ content: 'Error converting video to gif' });
            } finally {
                setTimeout(() => {
                    fs.unlinkSync(originalAttachmentPath);
                    fs.unlinkSync(`temp/${userName}-SPCHSTRETCH-${rnd5dig}.png`);
                    fs.unlinkSync(`temp/${userName}-SPCHCOMBINED-${rnd5dig}.${contentType}`);
                    fs.unlinkSync(`temp/${userName}-SPCHFINAL-${rnd5dig}.gif`);
                }, 10000);
            }
        }
    }
}


async function convertToGIF(userName, originalAttachmentPath, contentType, rnd5dig, width, height, duration) {
    const outputPath = `temp/${userName}-SPCHFINAL-${rnd5dig}.gif`;

    sharp.cache(false);

    // Step 1: Use sharp to stretch the speech bubble to the width of the video
    const speechbubble = fs.readFileSync('images/speechbubble.png');
    const resized = await sharp(speechbubble)
        .resize(width, height, {
            fit: 'fill',
            withoutEnlargement: false,
        })
        .toBuffer();
    fs.writeFileSync(`temp/${userName}-SPCHSTRETCH-${rnd5dig}.png`, resized);

    // Step 2: Use ffmpeg for video and overlay the speech bubble
    const extendedAttachmentPath = `temp/${userName}-SPCHCOMBINED-${rnd5dig}.${contentType}`;
    if (originalAttachmentPath.includes('mp4')) {
        await new Promise((resolve, reject) => {
            ffmpeg(originalAttachmentPath)
                .input(`temp/${userName}-SPCHMASK-${rnd5dig}.png`)
                .complexFilter([
                    '[0:v][1:v]overlay=0:0[out]'
                ])
                .map('[out]')
                .output(extendedAttachmentPath)
                .on('end', resolve)
                .on('error', reject)
                .run();
        });
    } else {
        // Use sharp to overlay the speech bubble for images
        await sharp(originalAttachmentPath)
            .composite([{ input: `temp/${userName}-SPCHSTRETCH-${rnd5dig}.png`, gravity: 'north' }])
            .toFile(extendedAttachmentPath);
    }

     const durfpstable = [
        [10, 20],
        [18, 15],
        [24, 10],
        [30, 8]
    ]

    // Step 3: Chromakey and convert to GIF
    try {
        return new Promise((resolve, reject) => {
            ffmpeg(extendedAttachmentPath)
                .fps(durfpstable.find(([dur]) => duration < dur)[1])
                .outputOptions(
                '-filter_complex',
                `[0:v]chromakey=color=0x0000ff:similarity=0.1:blend=0.4[transparent];[transparent]split[transparent1][transparent2];[transparent1]palettegen=stats_mode=diff[palette];[transparent2][palette]paletteuse=dither=bayer:bayer_scale=5`
                )
                .outputOptions([
                '-y',                // Overwrite output file if exists
                '-c:v', 'gif',       // Output format is GIF
                ])
                .save(outputPath)
                .on('end', () => {
                resolve(outputPath);
                })
                .on('error', reject)
                .run();
        });
    } catch (error) {
        console.error('Error:', error);
        return { attachments: null, error: 'Error converting the file.' };
    } finally {
        // delete files
        fs.unlinkSync(extendedAttachmentPath);
    }
}

            