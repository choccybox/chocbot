const altnames = ['download', 'down', 'dl'];
const quickdesc = 'download video/audio from social/music platforms (YouTube, Twitter, Instagram, SoundCLoud, Spotify) *Spotify may not result with a correct song if its not found on youtube.*';

const dotenv = require('dotenv');
dotenv.config();

const fs = require('fs');
const downloader = require('../backbone/dlManager.js');
const { exec } = require('child_process');
const util = require('util');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    run: async function handleMessage(message, client, isChained) {
        if (message.content.includes('help')) {
            const commandParts = message.content.trim().split(' ');
            const commandUsed = altnames.find(name => commandParts.some(part => part.endsWith(name) || part === name))
            return message.reply({
                content: `${quickdesc}\n` +
                    `### modifiers: \n\`audio/aud (audio only)\`\n` +
                    `### example: \n\`${commandUsed} https://www.youtube.com/watch?v=dQw4w9WgXcQ\`, \`${commandUsed}:aud https://www.youtube.com/watch?v=dQw4w9WgXcQ\`\n` +
                    `### aliases:\n\`${altnames.join(', ')}\`\n`,
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
                let downloadLink = message.content.match(/(https?:\/\/[^\s]+)/g)[0];
                
                // Check if it's a YouTube playlist URL - if so, keep it as is
                const isPlaylist = downloadLink.includes('list=') || downloadLink.includes('/playlist');
                
                // Only sanitize YouTube URLs if they're NOT playlists
                if (!isPlaylist && (downloadLink.includes('youtube.com') || downloadLink.includes('youtu.be'))) {
                    const urlObj = new URL(downloadLink);
                    if (urlObj.hostname.includes('youtube.com')) {
                        const videoId = urlObj.searchParams.get('v');
                        if (videoId) {
                            downloadLink = `https://www.youtube.com/watch?v=${videoId}`;
                        }
                    } else if (urlObj.hostname.includes('youtu.be')) {
                        const videoId = urlObj.pathname.slice(1).split('?')[0];
                        downloadLink = `https://www.youtube.com/watch?v=${videoId}`;
                    }
                }
                
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
                    if (response.message) {
                        if (message.editReply) {
                            return message.editReply({ content: `❌ ${response.message}` });
                        }
                        return message.reply({ content: response.message });
                    } else {
                        if (message.editReply) {
                            return message.editReply({ content: `❌ I wasn't able to download this video. The source might be unavailable or restricted.` });
                        }
                        return message.reply({ content: `I wasn't able to download this video. The source might be unavailable or restricted.` });
                    }
                }

                console.log(response);

                if (response.success) {
                    console.log('Download successful:', response);
                    
                    // Handle playlist downloads (zip files)
                    if (response.isPlaylist) {
                        const fileName = response.title;
                        const filePath = `temp/${fileName}.zip`;
                        
                        if (!fs.existsSync(filePath)) {
                            if (message.editReply) {
                                return message.editReply({ content: '❌ Playlist file not found.' });
                            }
                            return message.reply({ content: 'Playlist file not found.' });
                        }
                        
                        const fileSize = fs.statSync(filePath).size;
                        const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(2);
                        
                        // Always provide download link instead of uploading
                        const encodedFileName = encodeURIComponent(`${fileName}.zip`).replace(/%20/g, ' ');
                        const fileUrl = `${process.env.UPLOADURL}/temp/${encodedFileName}`;
                        
                        const deleteDelay = (parseInt(process.env.FILE_DELETE_TIMEOUT) || 30) * 60000; // Convert minutes to milliseconds
                        const deleteMinutes = Math.floor(deleteDelay / 60000);
                        
                        const downloadMessage = `✅ **Playlist downloaded successfully!**\n\n` +
                            `📦 **File:** ${fileName}.zip\n` +
                            `📊 **Size:** ${fileSizeMB} MB\n` +
                            `🔗 **Download:** [Click here](${fileUrl})\n\n` +
                            `⏰ File will be deleted in ${deleteMinutes} minutes.`;
                        
                        if (message.editReply) {
                            await message.editReply({ content: downloadMessage });
                        } else {
                            await message.reply({ content: downloadMessage });
                        }
                        
                        // Delete zip file after timeout
                        setTimeout(() => {
                            if (fs.existsSync(filePath)) {
                                fs.unlinkSync(filePath);
                                console.log(`Deleted: ${filePath}`);
                            }
                        }, deleteDelay);
                        
                        return;
                    }
                    
                    // check if file exists in temp folder
                    const findFile = (baseName) => {
                        const files = fs.readdirSync('./temp/');
                        return files.find(file => file.startsWith(baseName));
                    };

                    let fileName = response.title;
                    let filePath = `temp/${fileName}.${convertArg ? 'mp3' : 'mp4'}`;
                    let isGif = false;
                    let originalFilePath = filePath; // Store original path for cleanup

                    if (!fs.existsSync(filePath)) {
                        const foundFile = findFile(fileName);
                        if (foundFile) {
                            filePath = `temp/${foundFile}`;
                            originalFilePath = filePath;
                        } else {
                            if (message.editReply) {
                                return message.editReply({ content: '❌ File not found.' });
                            }
                            return message.reply({ content: 'File not found.' });
                        }
                    }

                    // Check if video has audio track (only for video files)
                    if (!convertArg && filePath.endsWith('.mp4')) {
                        const execPromise = util.promisify(exec);
                        
                        try {
                            const { stdout } = await execPromise(`ffprobe -v error -select_streams a:0 -show_entries stream=codec_type -of default=noprint_wrappers=1:nokey=1 "${filePath}"`);
                            const hasAudio = stdout.trim() === 'audio';
                            
                            if (!hasAudio) {
                                const row = new ActionRowBuilder()
                                    .addComponents(
                                        new ButtonBuilder()
                                            .setCustomId('convert_to_gif')
                                            .setLabel('Convert to GIF')
                                            .setStyle(ButtonStyle.Primary),
                                        new ButtonBuilder()
                                            .setCustomId('keep_video')
                                            .setLabel('Keep as Video')
                                            .setStyle(ButtonStyle.Secondary)
                                    );

                                const promptMsg = await message.reply({ 
                                    content: 'This video has no audio track. Would you like to convert it to a GIF?', 
                                    components: [row] 
                                });

                                const filter = (i) => i.user.id === message.author.id;
                                try {
                                    const interaction = await promptMsg.awaitMessageComponent({ filter, time: 30000 });
                                    
                                    if (interaction.customId === 'convert_to_gif') {
                                        const convertMsg = await interaction.update({ content: 'Converting to GIF...', components: [] });
                                        setTimeout(() => {
                                            convertMsg.delete().catch(console.error);
                                        }, 3000);
                                        
                                        const gifPath = filePath.replace('.mp4', '.gif');
                                        const palettePath = filePath.replace('.mp4', '_palette.png');
                                        
                                        // Get original video dimensions
                                        const { stdout: dimensions } = await execPromise(`ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${filePath}"`);
                                        const [width, height] = dimensions.trim().split('x').map(Number);
                                        
                                        let scale = height;
                                        let attempts = 0;
                                        const maxAttempts = 10;
                                        
                                        while (attempts < maxAttempts) {
                                            // Generate palette with current scale
                                            await execPromise(`ffmpeg -y -i "${filePath}" -vf "fps=15,scale=-1:${scale}:flags=lanczos,palettegen=stats_mode=diff" "${palettePath}"`);
                                            
                                            // Generate GIF using palette
                                            await execPromise(`ffmpeg -y -i "${filePath}" -i "${palettePath}" -filter_complex "fps=15,scale=-1:${scale}:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5" "${gifPath}"`);
                                            
                                            if (fs.existsSync(gifPath)) {
                                                const gifSize = fs.statSync(gifPath).size;
                                                const maxSize = 10 * 1024 * 1024; // 8 MB
                                                
                                                if (gifSize <= maxSize) {
                                                    // Clean up palette file
                                                    if (fs.existsSync(palettePath)) fs.unlinkSync(palettePath);
                                                    filePath = gifPath;
                                                    isGif = true;
                                                    break;
                                                } else {
                                                    // Reduce scale to 75% of current height
                                                    scale = Math.floor(scale * 0.75);
                                                    attempts++;
                                                }
                                            } else {
                                                break;
                                            }
                                        }
                                        
                                        // Clean up palette file if still exists
                                        if (fs.existsSync(palettePath)) fs.unlinkSync(palettePath);
                                    } else {
                                        await interaction.update({ content: 'Keeping as video.', components: [] });
                                    }
                                } catch (err) {
                                    await promptMsg.edit({ content: 'No response. Sending as video.', components: [] });
                                }
                            }
                        } catch (error) {
                            console.error('Error checking audio track:', error);
                        }
                    }


                    const fileSize = fs.statSync(filePath).size;
                    const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(2);
                    
                    const deleteDelay = (parseInt(process.env.FILE_DELETE_TIMEOUT) || 30) * 60000; // Convert minutes to milliseconds
                    const deleteMinutes = Math.floor(deleteDelay / 60000);
                    
                    // Always provide download link instead of uploading
                    const encodedFileName = encodeURIComponent(filePath.split('/').pop()).replace(/%20/g, ' ');
                    const fileUrl = `${process.env.UPLOADURL}/temp/${encodedFileName}`;
                    const displayName = filePath.split('/').pop();
                    
                    const downloadMessage = `✅ **Download complete!**\n\n` +
                        `📁 **File:** ${displayName}\n` +
                        `📊 **Size:** ${fileSizeMB} MB\n` +
                        `🔗 **Download:** [Click here](${fileUrl})\n\n` +
                        `⏰ File will be deleted in ${deleteMinutes} minutes.`;
                    
                    if (message.editReply) {
                        await message.editReply({ content: downloadMessage });
                    } else {
                        await message.reply({ content: downloadMessage });
                    }

                    // Delete files after timeout
                    
                    // Delete original video file
                    if (fs.existsSync(originalFilePath)) {
                        setTimeout(() => {
                            if (fs.existsSync(originalFilePath)) {
                                fs.unlinkSync(originalFilePath);
                                console.log(`Deleted: ${originalFilePath}`);
                            }
                        }, deleteDelay);
                    }
                    
                    // Delete converted GIF file (if different from original)
                    if (isGif && filePath !== originalFilePath && fs.existsSync(filePath)) {
                        setTimeout(() => {
                            if (fs.existsSync(filePath)) {
                                fs.unlinkSync(filePath);
                                console.log(`Deleted: ${filePath}`);
                            }
                        }, deleteDelay);
                    }
                } else {
                    if (message.editReply) {
                        await message.editReply({ content: '❌ Error sending URL to downloader.' });
                    } else {
                        message.reply({ content: 'Error sending URL to downloader.js.' });
                    }
                }
            } catch (error) {
                console.error('Error sending URL to downloader.js:', error);
                if (message.editReply) {
                    await message.editReply({ content: '❌ Error processing download request.' });
                } else {
                    message.reply({ content: 'Error sending URL to downloader.js.' });
                }
            }
        }
    }
};