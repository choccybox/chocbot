const altnames = ['audio', 'aa', 'audioanalyze', 'speech2text', 's2t', 'stt'];
const quickdesc = 'Transcribes audio/video to text, supports audio/video and links (youtube, twitter, instagram)';

const dotenv = require('dotenv');
dotenv.config();
const fs = require('fs');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const downloader = require('../backbone/dlManager.js');

module.exports = {
    run: async function handleMessage(message, client, currentAttachments, isChained) {
        if (message.content.includes('help')) {
            const commandUsed = message.content.split(' ').find(part => part !== 'help' && !part.startsWith('<@'));
            return message.reply({
                content: `${quickdesc}\n` +
                    `### Examples:\n\`${commandUsed} https://www.youtube.com/watch?v=dQw4w9WgXcQ\` \`${commandUsed} attachment\`\n` +
                    `### Aliases:\n\`${altnames.join(', ')}\``,
            });
        }
        const hasAttachment = currentAttachments || message.attachments;
        const firstAttachment = hasAttachment.first();
        const hasALink = message.content.includes('http') || message.content.includes('www.');
        if (!hasALink) {
            console.log('doesnt have a link, using attachment');
            const isVideoOrAudio = firstAttachment && (firstAttachment.contentType.includes('video') || firstAttachment.contentType.includes('audio'));
            if (!isVideoOrAudio) {
                return message.reply({ content: 'Please provide an audio or video file to process.' });
            } else {
            const fileUrl = firstAttachment.url;
            const randomName = message.author.id;
            const contentType = firstAttachment.contentType.split('/')[1];
            const rnd5dig = Math.floor(Math.random() * 90000) + 10000;

            // react to the message to show that the bot is processing the audio
            message.react('🔽');
    
            const downloadFile = await axios.get(fileUrl, { responseType: 'arraybuffer' });
            const fileData = downloadFile.data;
            const fileExtension = contentType === 'mpeg' ? 'mp3' : contentType;
            const fileName = firstAttachment.name;
            await fs.writeFileSync(`temp/${randomName}-S2T-${rnd5dig}.${fileExtension}`, fileData);
        
            try {
                if (firstAttachment.contentType.startsWith('video/') && contentType !== 'mp3') {
                    await new Promise((resolve, reject) => {
                        ffmpeg(`temp/${randomName}-S2T-${rnd5dig}.${contentType}`)
                            .toFormat('mp3')
                            .on('end', resolve)
                            .on('error', reject)
                            .save(`temp/${randomName}-S2T-${rnd5dig}.mp3`);
                    });
                }

                const audioData = fs.readFileSync(`temp/${randomName}-S2T-${rnd5dig}.${contentType === 'mp3' ? 'mp3' : 'mp3'}`);
                message.reactions.removeAll().catch(console.error);
                message.react('<a:pukekospin:1311021344149868555>').catch(() => message.react('👍'));
                await processAudio(audioData.toString('base64'), message, randomName, fileName, rnd5dig);
                message.reactions.removeAll().catch(console.error);

            } catch (error) {
                console.error('Error processing:', error);
                return { attachments: null, error: 'Error processing the file.' };
            }
        }
        } else {
            console.log('has a link, sending to downloader.js');
            const randomName = message.author.id;
            const rnd5dig = Math.floor(Math.random() * 90000) + 10000;
            const identifierName = 'S2T';
            const convertArg = true;
            const useIdentifier = true;

            try {
                const downloadLink = message.content.match(/(https?:\/\/[^\s]+)/g)[0];
                const response = await downloader.downloadURL(message, downloadLink, randomName, rnd5dig, identifierName, convertArg, useIdentifier).catch(error => {
                    console.error('Error sending URL to downloader.js:', error);
                    return { success: false };
                });

                if (response.success) {
                    const audioData = fs.readFileSync(`temp/${randomName}-S2T-${rnd5dig}.mp3`);
                    message.reactions.removeAll().catch(console.error);
                    message.react('<a:pukekospin:1311021344149868555>').catch(() => message.react('👍'));
                    await processAudio(audioData.toString('base64'), message, randomName, rnd5dig);
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
};
        

async function processAudio(base64Audio, message, randomName, rnd5dig) {
    try {
        // console.log('using model:', abrmodelstomodelnames[model]);
        const deepInfraPrediction = await axios.post('https://api.deepinfra.com/v1/inference/distil-whisper/distil-large-v3', {
            audio: base64Audio,
            authorization: process.env.DEEPINFRA_TOKEN,
        });

        const predictionRawText = deepInfraPrediction.data.text;

        if (predictionRawText.length > 2000) {
            fs.writeFileSync(`./temp/${randomName}-S2T-${rnd5dig}.txt`, predictionRawText);
            message.reply({
                files: [`./temp/${randomName}-S2T-${rnd5dig}.txt`],
            });
        } else {
            message.reply({
                content: predictionRawText,
            });
        }
    } catch (error) {
        console.error(error);
        return message.reply({ content: 'the model fucking gave up dawg, try again ig' });
    } finally {
        // delete all files including S2T in the name, only target mp3, mp4 and txt files, wait 30s before deleting
        const filesToDelete = fs.readdirSync('./temp/').filter((file) => {
            return file.includes('S2T');
        });
        filesToDelete.forEach((file) => {
            setTimeout(() => {
            fs.unlinkSync(`./temp/${file}`);
            }, 5000);
        });
    }
}
