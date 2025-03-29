const altnames = ['tovideo', '2video', 'tovid', '2vid']
const quickdesc = 'Converts a gif to a video'

const dotenv = require('dotenv');
dotenv.config();
const fs = require('fs');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');

module.exports = {
    run: async function handleMessage(message, client, currentAttachments, isChained) {
        if (message.content.includes('help')) {
            return message.reply({
                content: `${quickdesc}\n` +
                    `### Aliases:\n\`${altnames.join(', ')}\``,
            });
        }
        const hasAttachment = currentAttachments || message.attachments;
        const firstAttachment = hasAttachment.first();
        const isVideo = firstAttachment && firstAttachment.contentType.includes('video');
        if (!isVideo) {
            return message.reply({ content: 'provide a video file to convert.' });
        } else {
            const attachment = firstAttachment;
            const fileUrl = attachment.url;
            const userName = message.author.id;
            const fileType = attachment.contentType;
            const contentType = attachment.contentType.split('/')[1];
            const rnd5dig = Math.floor(Math.random() * 90000) + 10000;
            
            const downloadFile = await axios.get(fileUrl, { responseType: 'arraybuffer' });
            const fileData = downloadFile.data;
            await fs.writeFileSync(`temp/${userName}-TOVIDCONV-${rnd5dig}.${contentType}`, fileData);

            try {
                message.react('<a:pukekospin:1311021344149868555>').catch(() => message.react('👍'));
                await convertToAudio(message, userName, contentType, rnd5dig);
            } catch (err) {
                console.error('Error:', err);
                return message.reply({ content: 'Error converting video to gif' });
            } finally {
                // delete all files including S2T in the name, only target mp3, mp4 and txt files, wait 30s before deleting
                const filesToDelete = fs.readdirSync('./temp/').filter((file) => {
                    return file.includes('TOVIDCONV') || file.includes('VIDEOFINAL');
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

    async function convertToAudio(message, userName, contentType, rnd5dig) {
        const outputPath = `temp/${userName}-VIDEOFINAL-${rnd5dig}.mp4`;

        return new Promise((resolve, reject) => {
            const ffmpegCommand = ffmpeg(`temp/${userName}-TOVIDCONV-${rnd5dig}.${contentType}`)
                .toFormat('mp4')
                .outputOptions([
                    '-y',
                    '-movflags faststart',
                    '-pix_fmt yuv420p',
                    '-vf "scale=trunc(iw/2)*2:trunc(ih/2)*2"'
                ]);

            ffmpegCommand
                .on('end', () => {
                    message.reply({
                        files: [{
                            attachment: outputPath
                        }]
                    }).then(() => {
                        resolve(outputPath);
                        message.reactions.removeAll().catch(console.error);
                    }).catch(reject);
                })
                .on('error', (err) => {
                    reject(new Error('Video conversion failed: ' + err.message));
                })
                .save(outputPath);
        });
    }