const altnames = ['audio', 'aa', 'audioanalyze', 'speech2text', 's2t', 'stt'];
const quickdesc = 'transcribe audio/video/links to text using openai whisper model';

const dotenv = require('dotenv');
dotenv.config();
const fs = require('fs');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const downloader = require('../backbone/dlManager.js');

module.exports = {
    run: async function handleMessage(message, client, currentAttachments, isChained) {
        if (message.content.includes('help')) {
            const commandParts = message.content.trim().split(' ');
            const commandUsed = altnames.find(name => commandParts.some(part => part.endsWith(name) || part === name))
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
            const filePath = `temp/${randomName}-S2T-${rnd5dig}.${fileExtension}`;
            const filePathConverted = `temp/${randomName}-S2T-${rnd5dig}.mp3`;
            await fs.writeFileSync(filePath, fileData);
        
            try {
                if (firstAttachment.contentType.startsWith('video/') && contentType !== 'mp3') {
                    await new Promise((resolve, reject) => {
                        ffmpeg(filePath)
                            .toFormat('mp3')
                            .on('end', resolve)
                            .on('error', reject)
                            .save(filePathConverted);
                    });
                }
                const audioData = fs.readFileSync(filePathConverted);
                message.reactions.removeAll().catch(console.error);
                message.react('<a:pukekospin:1311021344149868555>').catch(() => message.react('👍'));
                await processAudio(audioData.toString('base64'), message, randomName, rnd5dig);
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

                console.log(response);

                if (response.success === false) {
                    message.reactions.removeAll().catch(console.error);
                    message.reply({ content: response.message });
                    return;
                } else if (response.success) {
                    const filePathConverted = `temp/${randomName}-S2T-${rnd5dig}.mp3`;
                    if (!fs.existsSync(filePathConverted)) {
                        message.reply({ content: 'Audio file not found after download/conversion.' });
                        return;
                    }
                    const audioData = fs.readFileSync(filePathConverted);
                    const base64Audio = audioData.toString('base64');
                    message.reactions.removeAll().catch(console.error);
                    message.react('<a:pukekospin:1311021344149868555>').catch(() => message.react('👍'));
                    await processAudio(base64Audio, message, randomName, rnd5dig);
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
        const deepInfraPrediction = await axios.post('https://api.deepinfra.com/v1/inference/openai/whisper-large-v3-turbo', {
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
        return message.reply({ content: `error occured, the model may not be available or partial outage on providers side. here's what i know:\n**error message: ${error.response?.status || 'unknown'} ${error.response?.data?.detail || 'No detail available'}**` });
    } finally {
        // Wait 5 seconds before deleting files
        setTimeout(() => {
            // Search for all files matching the pattern and clean them up
            const tempDir = './temp';
            const pattern = new RegExp(`${randomName}-S2T-\\d+`);
            
            fs.readdirSync(tempDir).forEach(file => {
                if (pattern.test(file)) {
                    try {
                        fs.unlinkSync(path.join(tempDir, file));
                        console.log(`Cleaned up file: ${file}`);
                    } catch (err) {
                        console.error(`Error deleting file ${file}:`, err);
                    }
                }
            });
        }, 5000); // 5000 milliseconds = 5 seconds
    }
}
