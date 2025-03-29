const altnames = ['rj', 'rio', 'riodejaneiro', 'rjd', 'rdj'];
const quickdesc = 'Adds a Rio De Janeiro instagram filter over image/video';

const fs = require('fs');
const axios = require('axios');
const sharp = require('sharp');
const { generate } = require('text-to-image');
const ffmpeg = require('fluent-ffmpeg');

module.exports = {
    run: async function handleMessage(message, client, currentAttachments, isChained) {
        if (message.content.includes('help')) {
            // console the message content and use the command that user used in the content
            const commandUsed = message.content.split(' ').find(part => part !== 'help' && !part.startsWith('<@'));
            return message.reply({
                content: `${quickdesc}\n` +
                    `### Arguments:\n`+
                    `\`${commandUsed}:intensity\` intesity of the filter, number between 2 and 8\n` +
                    `\`${commandUsed}:customtext\` input your own text\n` +
                    `\`${commandUsed}:notext\` removes text from the image\n` +
                    `### Examples:\n\`${commandUsed}:3\` \`${commandUsed}:7:never gonna\` \`${commandUsed}:notext\`\n` +
                    `### Aliases:\n\`${altnames.join(', ')}\``,
            });
        }
        const hasAttachment = currentAttachments || message.attachments;
        const firstAttachment = hasAttachment.first();
        // check if there is an attachment, if not return a message
        if (!firstAttachment) {
            return message.reply({ content: 'Please provide an image or video to process.' });
        }
        const isImage = firstAttachment && firstAttachment.contentType.includes('image') || firstAttachment.contentType.includes('video');
        if (!isImage || !firstAttachment) {
            return message.reply({ content: 'Please provide an audio or video file to process.' });
            // else if its a gif
        } else if (firstAttachment.contentType.includes('gif')) {
            return message.reply({ content: 'gifs will be converted to mp4, fuck you thats why' })
        }
        const args = message.content.split(' ');
        let intensityDecimal = 0.5; // Default intensity
        let customText = 'Rio De Janeiro'; // Default text
        let useText = true;

        if (args.length > 1 && args[1].includes(':')) {
            const parts = message.content.split(':');
            if (parts.includes('notext')) {
            useText = false;
            } else if (parts.length === 2) {
            if (isNaN(parts[1])) {
                customText = parts.slice(1).join(':');
            } else {
                intensityDecimal = parseInt(parts[1], 10) / 10 || 0.5;
            }
            } else if (parts.length >= 3) {
            if (isNaN(parts[1])) {
                customText = parts.slice(1, -1).join(':');
                intensityDecimal = parseInt(parts[parts.length - 1], 10) / 10 || 0.5;
            } else {
                intensityDecimal = parseInt(parts[1], 10) / 10 || 0.5;
                customText = parts.slice(2).join(':');
            }
            }
        }

        console.log('Intensity:', intensityDecimal, 'Custom text:', customText, 'Use text:', useText);

        const attachmentURL = firstAttachment.url;

        try {
            const userName = message.author.id;
            const opacity = intensityDecimal;
            const rnd5dig = Math.floor(Math.random() * 90000) + 10000;
            const customizedText = customText ? customText : 'Rio De Janeiro';
            const useTextOverlay = useText;

            // Download the base attachment, convert gifs to mp4
            const downloadAttachment = await axios.get(attachmentURL, { responseType: 'arraybuffer' });
            let originalAttachmentPath = `temp/${userName}-RIO-${rnd5dig}.${attachmentURL.split('.').pop().split('?')[0]}`;
            fs.writeFileSync(originalAttachmentPath, downloadAttachment.data);

            // Get image/video dimensions using ffprobe for text positioning
            const getDimensions = () => {
                return new Promise((resolve, reject) => {
                    ffmpeg.ffprobe(originalAttachmentPath, (err, metadata) => {
                        if (err) return reject(err);
                        const stream = metadata.streams.find(s => s.width && s.height);
                        if (stream) {
                            resolve({ width: stream.width, height: stream.height });
                        } else {
                            reject(new Error('No stream with width and height found'));
                        }
                    });
                });
            };

            const { width, height } = await getDimensions();

            let extension = originalAttachmentPath.split('.').pop().toLowerCase();
            if (['jpg', 'jpeg', 'png', 'webp'].includes(extension)) {
                extension = 'png';
            } else if (['mkv', 'webm', 'mp4'].includes(extension)) {
                extension = 'mp4';
            }

            const fontPath = 'fonts/InstagramSans.ttf'; // Path to custom font file
            const overlaidAttachmentPath = `temp/${userName}-RIOOVERLAID-${rnd5dig}.png`;

            // set the font size to 1/10th of the image entire size
            const fontSize = Math.floor(Math.min(width, height) / 10);

            // Call function to overlay image and text
            message.react('<a:pukekospin:1311021344149868555>').catch(() => message.react('👍'));
            await overlayImageAndText(width, height, fontSize, fontPath, originalAttachmentPath, overlaidAttachmentPath, opacity, userName, rnd5dig, customizedText, useTextOverlay, extension, message);
            return;

        } catch (error) {
            console.error('Error processing the image:', error);
            return message.reply({ content: `Error processing the image: ${error}`, ephemeral: true });
        }
    }
};

async function overlayImageAndText(width, height, fontSize, fontPath, originalAttachmentPath, overlaidAttachmentPath, opacity, userName, rnd5dig, customizedText, useTextOverlay, extension, message) {
    try {
        sharp.cache(false);
        // Resize 'riodejaneiro.png' to match the specified width and height and set opacity
        const overlayImage = await sharp(`images/riodejaneiro.png`)
            .resize(width, height)
            .ensureAlpha(opacity)
            .toBuffer();
            fs.writeFileSync(`temp/${userName}-RIOSTRETCH-${rnd5dig}.png`, overlayImage);

        if (useTextOverlay) {
            // Generate text image using 'text-to-image' module
            const dataUri = await generate(customizedText, {
            debug: true,
            maxWidth: width,
            customHeight: height,
            fontSize: fontSize,
            fontPath: fontPath,
            fontFamily: 'InstagramSans',
            lineHeight: fontSize * 1.2,
            bgColor: 'transparent',
            textColor: 'white',
            textAlign: 'center',
            verticalAlign: 'center',
            });
            const base64Data = dataUri.replace(/^data:image\/png;base64,/, '');
            fs.writeFileSync(`temp/${userName}-RIOTEXT-${rnd5dig}.png`, base64Data, 'base64');

            // overlay the text image on the resized overlay image
            const overlayedImage = await sharp(`temp/${userName}-RIOSTRETCH-${rnd5dig}.png`)
            .composite([{ input: `temp/${userName}-RIOTEXT-${rnd5dig}.png` }])
            .toBuffer();
            fs.writeFileSync(overlaidAttachmentPath, overlayedImage);
        } else {
            // If no text overlay, just use the resized overlay image
            fs.writeFileSync(overlaidAttachmentPath, overlayImage);
        }
        
        // if file is a video, use ffmpeg to overlay the image over the video
        if (originalAttachmentPath.includes('mp4')) {
            console.log('Overlaying image on video');
            const videoOutputPath = `temp/${userName}-RIOFINAL-${rnd5dig}.mp4`;
            await new Promise((resolve, reject) => {
                ffmpeg(originalAttachmentPath)
                    .input(overlaidAttachmentPath)
                    .complexFilter([
                        {
                            filter: 'overlay',
                            options: {
                                x: '(main_w-overlay_w)/2',
                                y: '(main_h-overlay_h)/2',
                            },
                        },
                    ])
                    .outputOptions(['-c:a copy'])
                    .output(videoOutputPath)
                    .on('end', resolve)
                    .on('error', reject)
                    .run();
            });
        } else {
            // overlay the image on the original image
            const overlayedImage = await sharp(originalAttachmentPath)
                .composite([{ input: overlaidAttachmentPath }])
                .toBuffer();
            fs.writeFileSync(`temp/${userName}-RIOFINAL-${rnd5dig}.png`, overlayedImage);
        }

        const finalFile = fs.readdirSync('./temp/').find(file => file.includes(`RIOFINAL-${rnd5dig}`));
        const finalFilePath = `temp/${finalFile}`;
        
        message.reply({
            files: [{
            attachment: finalFilePath
            }]
        });
        message.reactions.removeAll().catch(console.error);

    } catch (error) {
        console.error('Error overlaying image and text:', error);
        throw new Error('Error overlaying image and text');
    } finally {
        const filesToDelete = fs.readdirSync('./temp/').filter((file) => {
            return file.includes('RIOSTRETCH') || file.includes('RIOTEXT') || file.includes('RIOOVERLAID') || file.includes('RIOFINAL') || file.includes('RIO');
        });
        filesToDelete.forEach((file) => {
            setTimeout(() => {
            fs.unlinkSync(`./temp/${file}`);
            }, 10000);
        });
    }
}