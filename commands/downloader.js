const altnames = ['download', 'down', 'dl'];
const quickdesc = 'download video/audio from social/music platforms (YouTube, Twitter, Instagram, SoundCLoud, Spotify) *Spotify may not result with a correct song if its not found on youtube.*';

const dotenv = require('dotenv');
dotenv.config();

const fs = require('fs');
const downloader = require('../backbone/dlManager.js');
//const downloaderPlaylist = require('../backbone/ytPlaylistManager.js');
//const ytpl = require('@distube/ytpl');
//const prettySeconds = require('pretty-seconds');
//const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

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
        } else if (
            hasLinks &&
            message.content.toLowerCase().includes('playlist') &&
            /(youtube\.com|youtu\.be)/i.test(message.content)
        ) {
            return message.reply({ content: 'playlist support is not available yet.' });
            
           /*  // use ytpl to get info from the playlist such as amount of videos, their title thumbnail, etc.
            const playlistLink = message.content.match(/(https?:\/\/[^\s]+)/g)[0];
            const playlist = await ytpl(playlistLink);
            console.log(playlist);
            // Build playlist info object (not repeated for each video)
            // Helper to convert "hh:mm:ss" or "mm:ss" to seconds
            function durationToSeconds(duration) {
                if (!duration) return 0;
                const parts = duration.split(':').map(Number);
                if (parts.length === 3) {
                    return parts[0] * 3600 + parts[1] * 60 + parts[2];
                } else if (parts.length === 2) {
                    return parts[0] * 60 + parts[1];
                } else if (parts.length === 1) {
                    return parts[0];
                }
                return 0;
            }

            // Import discogs client
            const discogsClient = new Discogs({ userToken: process.env.DISCOGS_TOKEN });
            let discogsData = {};

            try {
                // Search Discogs for the playlist title (remove "Album - " prefix)
                const searchTitle = playlist.title.replace(/^Album - /, '').trim();
                const discogsResult = await discogsClient.database().search(searchTitle, { type: 'release', per_page: 1 });
                if (discogsResult.results && discogsResult.results.length > 0) {
                    const release = discogsResult.results[0];
                    discogsData = {
                        artist: (release.artist || (playlist.items[0]?.author?.name ?? '')).replace(/ - Topic$/, ''),
                        year: release.year || '',
                        genre: release.genre ? (Array.isArray(release.genre) ? release.genre.join(', ') : release.genre) : '',
                        cover_image: release.cover_image || playlist.thumbnail.url
                    };
                }
            } catch (err) {
                console.error('Discogs lookup failed:', err);
                // fallback to playlist info only
                discogsData = {
                    artist: playlist.items[0]?.author?.name ?? '',
                    year: '',
                    label: '',
                    genre: '',
                    discogs_url: '',
                    cover_image: playlist.thumbnail.url
                };
            }

            const playlistInfo = {
                title: playlist.title.replace(/^Album - /, ''),
                thumbnail: discogsData.cover_image || playlist.thumbnail.url,
                artist: discogsData.artist,
                year: discogsData.year,
                label: discogsData.label,
                genre: discogsData.genre,
                discogs_url: discogsData.discogs_url,
                videos: playlist.items.map((video, idx) => ({
                    title: video.title,
                    number: idx + 1, // get number by getting video place in items
                    id: video.id,
                    thumbnail: video.thumbnail,
                    duration: video.duration,
                })),
                total_duration: prettySeconds(
                    playlist.items.reduce((sum, video) => sum + durationToSeconds(video.duration), 0)
                )
            };
            // create folder and json file
            const safeTitle = playlist.title.replace(/^Album - /, '').toLowerCase();
            const folderPath = `temp/${safeTitle}`;
            if (!fs.existsSync(folderPath)) {
                fs.mkdirSync(folderPath, { recursive: true });
            }
            const tempFilePath = `${folderPath}/${safeTitle}.json`;
            fs.writeFileSync(tempFilePath, JSON.stringify(playlistInfo, null, 2), 'utf8');

            // Send playlist info and ask user to continue or cancel

            const playlistEmbed = new EmbedBuilder()
                .setTitle(`${playlistInfo.title}`)
                .setDescription(`you're about to download a playlist with **${playlistInfo.videos.length}** videos\ntotal duration: **${playlistInfo.total_duration}**\n\n**do you want to continue?**\naudio quality is limited to **124kbps** and some data is gathered from discogs such as release year and cover art.`)
                .setThumbnail(playlistInfo.thumbnail)
                .setColor(0x00AE86);

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('continue_download')
                        .setLabel('Continue')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId('cancel_download')
                        .setLabel('Cancel')
                        .setStyle(ButtonStyle.Danger)
                );

            const infoMsg = await message.reply({ 
                embeds: [playlistEmbed], 
                components: [row] 
            });

            // Wait for button interaction
            const filter = (i) => i.user.id === message.author.id;
            try {
                const interaction = await infoMsg.awaitMessageComponent({ filter, time: 60000 });
                if (interaction.customId === 'cancel_download') {
                    await interaction.update({ content: 'Download cancelled.', embeds: [], components: [] });
                    // Clean up temp file and folder
                    if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
                    if (fs.existsSync(folderPath)) fs.rmdirSync(folderPath, { recursive: true });
                    return;
                }
                await interaction.update({ content: `Starting download, this should take just a few mins, you'll be notified when it's done`, embeds: [], components: [] });
            } catch (err) {
                await infoMsg.edit({ content: 'No response. Download cancelled.', embeds: [], components: [] });
                if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
                if (fs.existsSync(folderPath)) fs.rmdirSync(folderPath, { recursive: true });
                return;
            }

            // send json file to downloader.js
            const response = await downloaderPlaylist.downloadPlaylist(message, tempFilePath, safeTitle).catch(error => {
                console.error('Error sending URL to downloader.js:', error);
                return { success: false };
            });

            if (!response.success) {
                return message.reply({ content: `i wasn't able to download this video, this may be because the video is either age restricted or there is an issue somewhere else, i apologize for the mistake` });
            }
            console.log(response);
            message.reactions.removeAll().catch(console.error);
            
            if (response.success) {
                const fileName = `${playlistInfo.title}.zip`;
                const filePath = `temp/${fileName}`;
                if (fs.existsSync(filePath)) {
                    const fileSize = fs.statSync(filePath).size;
                    if (fileSize < 10 * 1024 * 1024) { // 10 MB
                        await message.reply({ files: [{ attachment: filePath, name: fileName }] });
                    } else {
                        const encodedFileName = encodeURIComponent(fileName);
                        const fileUrl = `${process.env.UPLOADURL}/temp/${encodedFileName}`;
                        await message.reply({ content: `File is too large to send. You can download it from [here](${fileUrl}).\nYour file will be deleted from the servers in 5 minutes.` });
                    }
                    // delete files and folder after 5 minutes
                    setTimeout(() => {
                        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
                        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                        if (fs.existsSync(folderPath)) fs.rmdirSync(folderPath, { recursive: true });
                    }, 300000); // 5 minutes
                } else {
                    await message.reply({ content: 'Zip file not found.' });
                }
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
                    message.reactions.removeAll().catch(console.error);
                    if (response.message) {
                        return message.reply({ content: response.message });
                    } else {
                        return message.reply({ content: `I wasn't able to download this video. The source might be unavailable or restricted.` });
                    }
                }

                console.log(response);

                if (response.success) {
                    console.log('Download successful:', response);
                    message.reactions.removeAll().catch(console.error);
                    // check if file exists in temp folder
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
                        const encodedFileName = encodeURIComponent(`${fileName}.${convertArg ? 'mp3' : 'mp4'}`).replace(/%20/g, ' ');
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