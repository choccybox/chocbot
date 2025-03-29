const altnames = ['caption', 'cap', 'text', 'txt'];
const quickdesc = 'Adds a caption to an image, supports images and videos';

const fs = require('fs');
const axios = require('axios');
const dotenv = require('dotenv').config();
const sharp = require('sharp');
const path = require('path');
const { generate, generateSync, ComputedOptions, Canvas } = require('text-to-image');
const ffmpeg = require('fluent-ffmpeg');

module.exports = {
    run: async function handleMessage(message, client, currentAttachments, isChained) {
        if (message.content.includes('help')) {
            return message.reply({
                content: 'Adds a **caption** to an image\n' +
                    'Arguments: `caption:text` where text is the caption you want to add\n' +
                    'Available alt names:`' + `${altnames.join(', ')}` + '`' +
                    'Available flags: `gif` converts the video to a gif\n',
            });
        }
        const hasAttachment = currentAttachments || message.attachments;
        const firstAttachment = hasAttachment.first();
        const isImage = firstAttachment && firstAttachment.contentType.includes('image') || firstAttachment.contentType.includes('video');
        if (!isImage) {
            return message.reply({ content: 'Please provide an audio or video file to process.' });
        }
        const args = message.content.split(':');

        let convertToGif = false;

        if (args.length > 1) {
            customText = args.slice(1).join(':');
        } else {
            return message.reply({ content: 'Please provide a caption in the format `caption:text`.' });
        }

        const attachmentURL = firstAttachment.url;

        const emojiRegex = /(\p{Emoji}|<a?:\w+:\d+>)/gu;

        // Remove emojis from the text
        const textWithoutEmojis = customText.replace(emojiRegex, '');
        console.log("Original Text:", customText);
        console.log("Text without emojis:", textWithoutEmojis);
        const textWithUnicode = textWithoutEmojis;

        try {
            const userName = message.author.id;
            const rnd5dig = Math.floor(Math.random() * 90000) + 10000;
            const customizedText = textWithUnicode;

            // Download the base image
            const downloadAttachment = await axios.get(attachmentURL, { responseType: 'arraybuffer' });
            const fileExtension = attachmentURL.split('.').pop().split('?')[0];
            let originalAttachmentPath = `temp/${userName}-CAP-${rnd5dig}.${fileExtension}`;
            fs.writeFileSync(originalAttachmentPath, downloadAttachment.data);

            // Check if file is a GIF and convert to MP4 if needed
            if (fileExtension.toLowerCase() === 'gif' || firstAttachment.contentType.includes('gif')) {
            const gifToMp4 = `temp/${userName}-CAP-${rnd5dig}.mp4`;
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
            }

            // Get image/video dimensions using ffprobe for text positioning
            const getDimensions = () => {
                return new Promise((resolve, reject) => {
                    ffmpeg.ffprobe(originalAttachmentPath, (err, metadata) => {
                        if (err) return reject(err);
                        const stream = metadata.streams.find(s => s.width && s.duration);
                        if (stream) {
                            resolve({ 
                                width: stream.width,
                                duration: Math.ceil(stream.duration) 
                            });
                        } else {
                            reject(new Error('No stream with width and height found'));
                        }
                    });
                });
            };

            const { width, duration } = await getDimensions();
            console.log(width, duration);
            const fontPath = 'fonts/Impact.ttf';

            // get the lenght of the text to calculate the font size
            const textLength = customizedText.length;

            // calculate the font size based on the length of the words to fit them in, minimum size is 26px max is 60px
            const fontSize = Math.max(Math.min(60, (width / textLength) * 1.5), 26);
            // Call function to overlay image and text
            message.react('<a:pukekospin:1311021344149868555>').catch(() => message.react('👍'));
            console.log(convertToGif);
            await overlayImageAndText(message, width, fontSize, fontPath, originalAttachmentPath, userName, rnd5dig, customizedText, convertToGif, duration);
            
            // delete all files that have these in their name: CAP CAPFINAL CAPSTRETCH
            setTimeout(() => {
                fs.readdirSync('./temp').forEach(file => {
                    if (file.includes('CAP') || file.includes('CAPFINAL') || file.includes('CAPSTRETCH')) {
                        fs.unlinkSync(`temp/${file}`);
                    }
                });
            }, 10000);

        } catch (error) {
            console.error('Error processing the image:', error);
            return message.reply({ content: `Error processing the image: ${error}`, ephemeral: true });
        }
    }
};

async function overlayImageAndText(message, width, fontSize, fontPath, originalAttachmentPath, userName, rnd5dig, customizedText, convertToGif, duration) {
    try {
        // Generate text image using 'text-to-image' module
        const dataUri = await generate(customizedText, {
            debug: true,
            maxWidth: width,
            fontSize: fontSize,
            fontPath: fontPath,
            fontFamily: 'Impact',
            lineHeight: fontSize * 1.4,
            bgColor: 'white',
            textColor: 'black',
            textAlign: 'center',
            verticalAlign: 'center',
            margin: 10,
        });
        const base64Data = dataUri.replace(/^data:image\/png;base64,/, '');
        fs.writeFileSync(`temp/${userName}-CAPTEXT-${rnd5dig}.png`, base64Data, 'base64');

        // use ffprobe to get the text image height and extend the attachment height to fit the text image (both video/image)
        const getDimensions = () => {
            return new Promise((resolve, reject) => {
                ffmpeg.ffprobe(`temp/${userName}-CAPTEXT-${rnd5dig}.png`, (err, metadata) => {
                    if (err) return reject(err);
                    const stream = metadata.streams.find(s => s.height);
                    if (stream) {
                        resolve(stream.height);
                    } else {
                        reject(new Error('No stream with height found'));
                    }
                });
            });
        };

        const height = await getDimensions();
        console.log('Text image height:', height);

        // use ffmpeg for video and add a white box above the video witt the height of "const height"
        const extendedAttachmentPath = `temp/${userName}-CAPSTRETCH-${rnd5dig}.png`;
        if (convertToGif || originalAttachmentPath.includes('mp4')) {
            console.log('Overlaying text on gif');
            const durfpstable = [
                [10, 15],
                [18, 12],
                [24, 10],
                [30, 8]
            ];

            const fps = durfpstable.find(([dur]) => duration < dur)?.[1] || 10;

            return new Promise((resolve, reject) => {
                ffmpeg(originalAttachmentPath)
                    .input(`temp/${userName}-CAPTEXT-${rnd5dig}.png`)
                    .complexFilter([
                        `[0:v]pad=iw:ih+${height}:0:${height}:color=white[padded]`,
                        `[padded][1:v]overlay=0:0[out]`,
                        `[out]scale=iw/2:ih/2[scaled]`,
                        `[scaled]split[s0][s1];[s0]palettegen=max_colors=256[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5`
                    ])
                    .outputOptions(['-y'])
                    .fps(fps)
                    .toFormat('gif')
                    .output(`temp/${userName}-CAPFINAL-${rnd5dig}.gif`)
                    .on('end', () => {
                        console.log('GIF conversion complete');
                        message.reply({ files: [`temp/${userName}-CAPFINAL-${rnd5dig}.gif`] });
                        message.reactions.removeAll().catch(console.error);
                        resolve(`temp/${userName}-CAPFINAL-${rnd5dig}.gif`);
                    })
                    .on('error', (err) => {
                        console.error('GIF conversion error:', err);
                        message.reply({ content: 'Error converting video to gif' }).catch(console.error);
                        reject(new Error('GIF conversion failed: ' + err.message));
                    })
                    .run();
            });
        } else {
            sharp.cache(false);
            // use sharp to extend the attachment height
            await sharp(originalAttachmentPath)
                .extend({ top: height, bottom: 0, left: 0, right: 0, background: { r: 255, g: 255, b: 255, alpha: 0 } })
                .toFile(extendedAttachmentPath);

            // get CAPTEXT and overlay on top of extendedAttachment
            await sharp(extendedAttachmentPath)
                .composite([{ input: `temp/${userName}-CAPTEXT-${rnd5dig}.png`, gravity: 'north' }])
                .toFile(`temp/${userName}-CAPFINAL-${rnd5dig}.png`);

            message.reply({ files: [`temp/${userName}-CAPFINAL-${rnd5dig}.png`] });
            message.reactions.removeAll().catch(console.error);
        }
    } catch (error) {
        console.error('Error overlaying image and text:', error);
        message.reply({ content: `Error overlaying image and text: ${error}`, ephemeral: true });
        return;
    }
}