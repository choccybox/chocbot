const altnames = ['lyrics', 'lyric', 'lyr', 'genius', 'gen'];
const quickdesc = 'Fings lyrics for a song from music platforms (YouTube, Spotify, SoundCloud)';

const dotenv = require('dotenv');
dotenv.config();
const { EmbedBuilder } = require('discord.js');
const downloader = require('../backbone/lyrManager.js');

module.exports = {
    run: async function handleMessage(message, client, isChained) {
        if (message.content.includes('help')) {
            const commandUsed = message.content.split(' ').find(part => part !== 'help' && !part.startsWith('<@'));
            return message.reply({
                content: `${quickdesc}\n` +
                    `### Arguments:\n`+
                    `\`${commandUsed}:synced\` searches for synced lyrics in LRC format\n` +
                    `### Examples:\n\`${commandUsed} https://www.youtube.com/watch?v=dQw4w9WgXcQ\` \`${commandUsed} never gonna give you up:synced\`\n` +
                    `### Aliases:\n\`${altnames.join(', ')}\``,
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

        // Check if the message includes ":synced" to set the synced variable
        const synced = messageContentWithoutCommand.includes(':synced');
        const searchQuery = synced 
            ? messageContentWithoutCommand.replace(':synced', '').trim() 
            : messageContentWithoutCommand;

        // Check if there's any content or links
        const hasContent = searchQuery.length > 0;
        const hasLinks = message.content.includes('http') || message.content.includes('www.');
        
        if (!hasContent && !hasLinks) {
            return message.reply({ content: 'Please provide a song name or a link.' });
        } else {
            try {
            const searchLink = hasLinks 
                ? message.content.match(/(https?:\/\/[^\s]+)/g)[0] 
                : searchQuery;
            console.log(`Searching for lyrics for: ${searchLink}, ${synced ? 'synced' : 'unsynced'}`);
            message.react('<a:pukekospin:1311021344149868555>').catch(() => message.react('👍'));
            const response = await downloader.searchForLyrics(message, searchLink, synced).catch(error => {
                console.error('Error sending URL to downloader.js:', error);
                return { success: false };
            });

                if (!response.success) {
                    return message.reply({ content: 'Error retrieving lyrics. Please try again later.' });
                }

                if (response.success) {
                    const exampleEmbed = new EmbedBuilder()
                        .setColor(0x0099FF)
                        .setTitle(response.fullTitle)
                        .setDescription(response.properLyrics)
                        .setThumbnail(response.properImage)
                        .addFields(
                            { name: ' ', value: response.properMoreFrom },
                        )
                        .setImage(response.properImage)
                        .setFooter({ text: response.properProvider })
                        .setColor(response.embedColor);

                    if (response.trackURL) {
                        exampleEmbed.setURL(response.trackURL);
                    }

                    await message.reply({ embeds: [exampleEmbed] });
                    message.reactions.removeAll().catch(console.error);
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