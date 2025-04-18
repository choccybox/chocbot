const altnames = ['download', 'down', 'dl'];
const quickdesc = 'Downloads a video/audio from social platforms (YouTube, Twitter, Instagram)';

const dotenv = require('dotenv');
dotenv.config();
const fs = require('fs');
const downloader = require('../backbone/dlManager.js');

module.exports = {
    run: async function handleMessage(message, client, isChained) {
        if (message.content.includes('help')) {
            const commandUsed = message.content.split(' ').find(part => part !== 'help' && !part.startsWith('<@'));
            return message.reply({
                content: `${quickdesc}\n` +
                    `### Example:\n\`${commandUsed} https://www.youtube.com/watch?v=dQw4w9WgXcQ\`\n` +
                    `### Audio Only:\n\`${commandUsed}:audio https://www.youtube.com/watch?v=dQw4w9WgXcQ\` \`${commandUsed}:aud https://www.youtube.com/watch?v=dQw4w9WgXcQ\`\n` +
                    `### Aliases:\n\`${altnames.join(', ')}\`\n`,
            });
        }
        // Extract the command and its arguments
        const commandParts = message.content.trim().split(' ');
        const command = commandParts[0].toLowerCase();
        
        // Remove the command and any aliases from consideration
        const messageContentWithoutCommand = commandParts.slice(1)
            .filter(part => !altnames.includes(part.toLowerCase()))
            .join(' ')
            .trim();
            
        // Check if there's any content or links
        const hasContent = messageContentWithoutCommand.length > 0;
        const hasLinks = message.content.includes('http') || message.content.includes('www.');

        if (!hasContent && !hasLinks) {
            return message.reply({ content: 'Please provide a valid link.' });
        } else {
            try {
                const downloadLink = message.content.match(/(https?:\/\/[^\s]+)/g)[0];
                const randomName = message.author.id;
                const rnd5dig = Math.floor(Math.random() * 90000) + 10000;
                const identifierName = 'DOWN';
                let convertArg = false;
                if (message.content.includes('audio') || message.content.includes('aud')) {
                    convertArg = true;
                }        
                
                console.log(convertArg);
                const response = await downloader.downloadURL(message, downloadLink, randomName, rnd5dig, identifierName, convertArg).catch(error => {
                    console.error('Error sending URL to downloader.js:', error);
                    return { success: false };
                });

                if (!response.success) {
                    return message.reply({ content: `i wasn't able to download this video, this may be because the video is either age restricted or there is an issue somewhere else, i apologize for the mistake` });
                }

                console.log(response);

                if (response.success) {
                    message.reactions.removeAll().catch(console.error);
                    const findFile = (baseName) => {
                        const files = fs.readdirSync('./temp/');
                        return files.find(file => file.startsWith(baseName));
                    };

                    let fileName = response.title;
                    let filePath = `temp/${fileName}.${convertArg ? 'mp3' : 'mp4'}`;

                    if (!fs.existsSync(filePath)) {
                        const foundFile = findFile(fileName);
                        if (foundFile) {
                            filePath = `temp/${foundFile}`;
                        } else {
                            return message.reply({ content: 'File not found.' });
                        }
                    }

                    const fileSize = fs.statSync(filePath).size;
                    if (fileSize < 10 * 1024 * 1024) { // 10 MB
                        const fileData = fs.readFileSync(filePath);
                        await message.reply({ files: [{ attachment: fileData, name: filePath.split('/').pop() }] });
                    } else {
                        const encodedFileName = encodeURIComponent(`${fileName}.${convertArg ? 'mp3' : 'mp4'}`);
                        const fileUrl = `${process.env.UPLOADURL}/temp/${encodedFileName}`;
                        await message.reply({ content: `File is too large to send. You can download it from [here](${fileUrl}).\nYour file will be deleted from the servers in 5 minutes.` });
                    }
                    message.reactions.removeAll().catch(console.error);

                    const filesToDelete = fs.readdirSync('./temp/').filter((file) => {
                        return file.includes(response.title) && (file.endsWith('.mp3') || file.endsWith('.mp4'));
                    });
                    filesToDelete.forEach((file) => {
                        const filePath = `./temp/${file}`;
                        const fileSize = fs.statSync(filePath).size;
                        const deleteDelay = fileSize < 10 * 1024 * 1024 ? 5000 : 300000; // 5 seconds for small files, 5 minutes for large files
                        setTimeout(() => {
                            fs.unlinkSync(filePath);
                        }, deleteDelay);
                    });
                } else {
                    message.reply({ content: 'Error sending URL to downloader.js.' });
                }
            } catch (error) {
                console.error('Error sending URL to downloader.js:', error);
                message.reply({ content: 'Error sending URL to downloader.js.' });
            }
        }
    }
};