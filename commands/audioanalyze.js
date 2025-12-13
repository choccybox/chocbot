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
        const hasAttachment = currentAttachments || message.attachments;
        const firstAttachment = hasAttachment && hasAttachment.size > 0 ? Array.from(hasAttachment.values())[0] : null;
        const hasALink = message.content.includes('http') || message.content.includes('www.');
        
        if (!hasALink && !firstAttachment) {
            return message.reply({ content: 'Please provide an audio/video file or URL to transcribe.' });
        }
        
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
    
            const downloadFile = await axios.get(fileUrl, { 
                responseType: 'arraybuffer',
                timeout: 30000,
                maxRedirects: 5
            });
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
                message.react('<a:pukekospin:1311021344149868555>').catch(() => message.react('👍'));
                const result = await processAudio(audioData.toString('base64'), message, randomName, rnd5dig);
                return result;

            } catch (error) {
                console.error('Error processing:', error);
                await message.reply({ content: 'Error processing the file.' });
                return { success: false };
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
                    await message.reply({ content: response.message });
                    return { success: false };
                } else if (response.success) {
                    const filePathConverted = `temp/${randomName}-S2T-${rnd5dig}.mp3`;
                    if (!fs.existsSync(filePathConverted)) {
                        await message.reply({ content: 'Audio file not found after download/conversion.' });
                        return { success: false };
                    }
                    const audioData = fs.readFileSync(filePathConverted);
                    const base64Audio = audioData.toString('base64');
                    message.react('<a:pukekospin:1311021344149868555>').catch(() => message.react('👍'));
                    const result = await processAudio(base64Audio, message, randomName, rnd5dig);
                    return result;
                } else {
                    await message.reply({ content: response.message });
                    return { success: false };
                }
            } catch (error) {
                console.error('Error sending URL to downloader.js:', error);
                await message.reply({ content: 'Error sending URL to downloader.js.' });
                return { success: false };
            }
        }
    }
};
        

async function processAudio(base64Audio, message, randomName, rnd5dig) {
    try {
        const deepInfraPrediction = await axios.post('https://api.deepinfra.com/v1/inference/openai/whisper-large-v3-turbo', 
            {
                audio: base64Audio
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.DEEPINFRA_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                timeout: 60000,
                maxRedirects: 5
            }
        );

        const predictionRawText = deepInfraPrediction.data.text;

        if (predictionRawText.length > 2000) {
            fs.writeFileSync(`./temp/${randomName}-S2T-${rnd5dig}.txt`, predictionRawText);
            await message.reply({
                files: [`./temp/${randomName}-S2T-${rnd5dig}.txt`],
            });
        } else {
            await message.reply({
                content: predictionRawText,
            });
        }
        
        return { success: true }; // Signal that command completed successfully
    } catch (error) {
        console.error(error);
        await message.reply({ content: `error occured, the model may not be available or partial outage on providers side. here's what i know:\n**error message: ${error.response?.status || 'unknown'} ${error.response?.data?.detail || 'No detail available'}**` });
        return { success: false };
    } finally {
        // Wait before deleting files using env variable (default 5 seconds for this type)
        const deleteDelay = 5000; // Keep 5 seconds for audio analysis temp files
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
        }, deleteDelay);
    }
}
