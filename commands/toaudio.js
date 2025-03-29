const altnames = ['toaudio', '2audio', 'toaud', '2aud']
const quickdesc = 'Converts a video or other audio files to a mp3';

const dotenv = require('dotenv');
dotenv.config();
const fs = require('fs');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const downloader = require('../backbone/dlManager.js');

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
        const hasALink = message.content.includes('http') || message.content.includes('www.');
        if (!hasALink) {
            console.log('doesnt have a link, using attachment');

            const isSupportedFormat = firstAttachment && (firstAttachment.contentType.includes('video') || firstAttachment.contentType.includes('audio'));
            const isMp3 = firstAttachment && firstAttachment.contentType === 'audio/mpeg';

            if (isMp3) {
                return message.reply({ content: 'The file is already an mp3.' });
            }
            if (!isSupportedFormat) {
                return message.reply({ content: 'Provide a video or audio file to convert.' });
            } else {
                const attachment = firstAttachment;
                const fileUrl = attachment.url;
                const userName = message.author.id;
                const fileType = attachment.contentType;
                const contentType = attachment.contentType.split('/')[1];
                const rnd5dig = Math.floor(Math.random() * 90000) + 10000;
                
                const downloadFile = await axios.get(fileUrl, { responseType: 'arraybuffer' });
                const fileData = downloadFile.data;
                await fs.writeFileSync(`temp/${userName}-TOMP3CONV-${rnd5dig}.${contentType}`, fileData);
                message.react('<a:pukekospin:1311021344149868555>').catch(() => message.react('👍'));
                await convertToAudio(message, userName, contentType, rnd5dig);
            }
        } else {
            console.log('has a link, sending to downloader.js');
            const downloadLink = message.content.match(/(https?:\/\/[^\s]+)/g)[0];
            const randomName = message.author.id;
            const rnd5dig = Math.floor(Math.random() * 90000) + 10000;
            const identifierName = 'AUDIOFINAL';

            try {
                // send the link to downloader.js
                const response = await downloader.downloadURL(message, downloadLink, randomName, rnd5dig, identifierName).catch(error => {
                    console.error('Error sending URL to downloader.js:', error);
                    return { success: false };
                });

                if (response.success) {
                    const audioData = fs.readFileSync(`temp/${randomName}-AUDIOFINAL-${rnd5dig}.mp3`);
                    message.reactions.removeAll().catch(console.error);
                    message.react('<a:pukekospin:1311021344149868555>').catch(() => message.react('👍'));
                    await message.reply({
                        files: [{
                            attachment: `temp/${randomName}-AUDIOFINAL-${rnd5dig}.mp3`
                        }]
                    });
                    message.reactions.removeAll().catch(console.error);
                } else {
                    message.reactions.removeAll().catch(console.error);
                    message.reply({ content: response.message });
                }
            } catch (error) {
                console.error('Error sending URL to downloader.js:', error);
                message.reply({ content: 'Error sending URL to downloader.js.' });
            }            
        }

    }
}

async function convertToAudio(message, userName, contentType, rnd5dig) {
    const outputPath = `temp/${userName}-AUDIOFINAL-${rnd5dig}.mp3`;

    try {
        return new Promise((resolve, reject) => {
            const ffmpegCommand = ffmpeg(`temp/${userName}-TOMP3CONV-${rnd5dig}.${contentType}`)
                .toFormat('mp3')
                .outputOptions(['-y']);
    
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
                        reject(new Error('Audio conversion failed: ' + err.message));
                    })
                    .save(outputPath);
            });
    } catch (err) {
        console.error('Error:', err);
        return message.reply({ content: 'error occured' });
    } finally {
        // delete all files including S2T in the name, only target mp3, mp4 and txt files, wait 30s before deleting
        const filesToDelete = fs.readdirSync('./temp/').filter((file) => {
            return file.includes('TOMP3CONV') || file.includes('AUDIOFINAL');
        });
        filesToDelete.forEach((file) => {
            setTimeout(() => {
            fs.unlinkSync(`./temp/${file}`);
            }, 10000);
        });        
    }
    }