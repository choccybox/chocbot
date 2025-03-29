const altnames = ['togif', 'gif', '2gif'];
const quickdesc = 'Converts a video/image to a gif';

const dotenv = require('dotenv');
dotenv.config();
const fs = require('fs');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');

module.exports = {
    run: async function handleMessage(message, client, currentAttachments, isChained) {
        if (message.content.includes('help')) {
            const commandUsed = message.content.split(' ').find(part => part !== 'help' && !part.startsWith('<@'));
            return message.reply({
                content: `${quickdesc}\n` +
                    `### Arguments:\n`+
                    `\`${commandUsed}:tt\` removes tiktok outro\n` +
                    `\`${commandUsed}:autocrop\` automatically crops the video to get rid of black bars\n` +
                    `\`${commandUsed}:dontresize\` keeps the original resolution of the video/image\n` +
                    `### Examples:\n\`${commandUsed}:tt:autocrop\` \`${commandUsed}:dontresize:tt\`` +
                    `### Aliases:\n\`${altnames.join(', ')}\``,
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
            const actualUsername = message.author.username;
            const contentType = attachment.contentType.split('/')[1];
            const rnd5dig = Math.floor(Math.random() * 90000) + 10000;

            const height = attachment.height / 2;
            const width = attachment.width / 2;

            const args = message.content.split(' ');

            // Check for arguments in the command
            let removeTT = false;
            let autoCrop = false;
            let dontResize = false;

            for (const arg of args) {
                const lowerArg = arg.toLowerCase();
                if (lowerArg.includes('tiktok') || lowerArg === 'tt') {
                    console.log('Removing TikTok outro');
                    removeTT = true;
                }
                if (lowerArg.includes('autocrop') || lowerArg === 'crop') {
                    console.log('Auto-cropping video');
                    autoCrop = true;
                }
                if (lowerArg.includes('dontresize') || lowerArg === 'dr') {
                    console.log('Keeping original size');
                    dontResize = true;
                }
            }
            
            const downloadFile = await axios.get(fileUrl, { responseType: 'arraybuffer' });
            const fileData = downloadFile.data;
            await fs.writeFileSync(`temp/${userName}-TOGIFCONV-${rnd5dig}.${contentType}`, fileData);

            let duration = 0;
            if (attachment.contentType.includes('video')) {
                duration = await new Promise((resolve, reject) => {
                    ffmpeg.ffprobe(`temp/${userName}-TOGIFCONV-${rnd5dig}.${contentType}`, (err, metadata) => {
                        if (err) return reject(err);
                        const stream = metadata.streams.find(s => s.duration);
                        if (stream) {
                            resolve(Math.round(stream.duration));
                        } else {
                            reject(new Error('No stream with duration found'));
                        }
                    });
                });
            }
            if (duration > 60) {
                return message.reply({ content: 'Video duration is too long, please provide a video with a duration of 60 seconds or less.' });
            }

            try {
                message.react('<a:pukekospin:1311021344149868555>').catch(() => message.react('👍'));
                await convertToGIF(message, userName, actualUsername, contentType, rnd5dig, height, width, duration, autoCrop, removeTT, dontResize);
                message.reactions.removeAll().catch(console.error);
            } catch (err) {
                console.error('Error:', err);
                return message.reply({ content: 'Error converting video to gif' });
            } finally {
                const filesToDelete = fs.readdirSync('./temp/').filter((file) => {
                    return file.includes('TOGIFCONV') || file.includes('GIFFINAL');
                });
                filesToDelete.forEach((file) => {
                    setTimeout(() => {
                    fs.unlinkSync(`./temp/${file}`);
                    }, 10000);
                });
            }
        }
    }
}


    async function convertToGIF(message, userName, actualUsername, contentType, rnd5dig, height, width, duration, autoCrop, removeTT, dontResize) {
        const outputPath = `temp/${userName}-GIFFINAL-${rnd5dig}.gif`;

        console.log(message, userName, actualUsername, contentType, rnd5dig, height, width, duration, autoCrop, removeTT, dontResize);

        const autoCropFilter = autoCrop ? ',cropdetect:' : '';
        const removeTTFilter = removeTT ? ',trim=end=' + (Math.round(duration) - 1) : '';
        const dontResizeFilter = dontResize ? '' : `scale=${width}:${height}:flags=lanczos,`;

        return new Promise((resolve, reject) => {
            const ffmpegCommand = ffmpeg(`temp/${userName}-TOGIFCONV-${rnd5dig}.${contentType}`)
                .toFormat('gif')
                .size(`${width}x${height}`)
                .outputOptions(['-y', '-compression_level', '6' ]);

            const durfpstable = [
                [10, 20],
                [18, 15],
                [24, 10],
                [30, 8],
                [60, 8]
            ]
            
            ffmpegCommand
                .fps(durfpstable.find(([dur]) => duration < dur)[1])
                .outputOptions([
                    '-vf', `${dontResizeFilter}split[s0][s1];[s0]palettegen=max_colors=256[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5${autoCropFilter}${removeTTFilter}`
                ])
                .on('end', () => {
                    message.reply({ files: [{ attachment: outputPath }] }).catch(console.error);
                    resolve(outputPath);
                })
                .on('error', (err) => {
                    message.reply({ content: 'Error converting video to gif' }).catch(console.error);
                    reject(new Error('GIF conversion failed: ' + err.message));
                })
                .save(outputPath);
        });
    }