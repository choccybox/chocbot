const altnames = ['download', 'down', 'dl'];
const quickdesc = 'Downloads a video/audio from social platforms (YouTube, Twitter, Instagram)';

const dotenv = require('dotenv');
dotenv.config();
const fs = require('fs');
const downloader = require('../backbone/dlManager.js');
const playlistdownloader = require('../backbone/ytPlaylistManager.js');
const ytpl = require("@distube/ytpl");
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

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
        // if link is a playlist, use the playlist downloader
        } else if (message.content.includes('playlist')) {
            return message.reply({ content: 'Playlist downloading is currently disabled.' });
        
            /* try {
            const playlistLink = message.content.match(/(https?:\/\/[^\s]+)/g)[0];
            const playlistID = playlistLink.split('list=')[1].split('&')[0];
            const rnd5dig = Math.floor(Math.random() * 90000) + 10000;
            
            // Show loading message
            const loadingMsg = await message.reply({ content: "Fetching playlist information..." });
            
            // Get playlist info
            const playlist = await ytpl(playlistID, { limit: Infinity });
            const videoCount = playlist.items.length;
            
            // Calculate total duration
            let totalSeconds = 0;
            playlist.items.forEach(video => {
                const parts = video.duration.split(':').map(Number);
                if (parts.length === 2) { // MM:SS
                totalSeconds += parts[0] * 60 + parts[1];
                } else if (parts.length === 3) { // HH:MM:SS
                totalSeconds += parts[0] * 3600 + parts[1] * 60 + parts[2];
                }
            });
            
            // Format duration
            const hours = Math.floor(totalSeconds / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            const seconds = totalSeconds % 60;
            const duration = `${hours > 0 ? hours + 'h ' : ''}${minutes}m ${seconds}s`;
            
            // Create confirmation buttons
            const row = new ActionRowBuilder()
                .addComponents(
                new ButtonBuilder()
                    .setCustomId('confirm_download')
                    .setLabel('Download')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('cancel_download')
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Danger)
                );
            
            await loadingMsg.edit({
                content: `Do you want to download this playlist?\n**${playlist.title}**\n• ${videoCount} videos\n• Total length: ${duration}`,
                components: [row]
            });
            
            // Create playlist data
            const playlistVideos = playlist.items.map(video => {
                return {
                title: video.title,
                shortUrl: video.shortUrl,
                thumbnail: video.thumbnail,
                duration: video.duration,
                };
            });
            
            const jsonFileName = `${playlist.title}_${rnd5dig}.json`;
            const tempFilePath = `temp/${jsonFileName}`;
            fs.writeFileSync(tempFilePath, JSON.stringify(playlistVideos, null, 2));
            
            // Handle button interactions
            const filter = i => i.user.id === message.author.id;
            const collector = message.channel.createMessageComponentCollector({ 
                filter, time: 60000, max: 1 
            });
            
            collector.on('collect', async i => {
                if (i.customId === 'confirm_download') {
                await i.update({ 
                    content: `Starting download of ${videoCount} videos from **${playlist.title}**...`, 
                    components: [] 
                });
                
                const response = await playlistdownloader.downloadPlaylist(message, tempFilePath)
                    .catch(error => {
                    console.error('Error downloading playlist:', error);
                    return { success: false };
                    });
                
                if (!response.success) {
                    return message.reply({ content: 'Something went wrong, please try again.' });
                }
                } else {
                await i.update({ 
                    content: 'Playlist download canceled.', 
                    components: [] 
                });
                fs.unlinkSync(tempFilePath);
                }
            });
            
            collector.on('end', collected => {
                if (collected.size === 0) {
                loadingMsg.edit({ 
                    content: 'Playlist download request timed out.', 
                    components: [] 
                });
                fs.unlinkSync(tempFilePath);
                }
            });
            } catch (error) {
            console.error('Error processing playlist:', error);
            return message.reply({ content: 'Failed to process the playlist. Make sure the link is valid.' });
            } */
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
                    return message.reply({ content: 'something went wrong, please try again.' });
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
                        const fileUrl = `${process.env.UPLOADURL}/temp/${fileName}.${convertArg ? 'mp3' : 'mp4'}`;
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