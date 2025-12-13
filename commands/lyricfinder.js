const altnames = ['lyrics', 'lyric', 'lyr', 'genius', 'gen'];
const quickdesc = 'Fings lyrics for a song from music platforms (YouTube, Spotify, SoundCloud)';

const dotenv = require('dotenv');
dotenv.config();
const { EmbedBuilder } = require('discord.js');
const downloader = require('../backbone/lyrManager.js');

module.exports = {
    run: async function handleMessage(message, client, isChained) {
        if (message.content.includes('help')) {
            const commandParts = message.content.trim().split(' ');
            const commandUsed = altnames.find(name => commandParts.some(part => part.endsWith(name) || part === name))
            return message.reply({
                content: `${quickdesc}\n` +
                    `### Example:\n\`${commandUsed} https://www.youtube.com/watch?v=dQw4w9WgXcQ\`\n` +
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
            
        // Check if there's any content or links
        const hasContent = messageContentWithoutCommand.length > 0;
        const hasLinks = message.content.includes('http') || message.content.includes('www.');
        
        if (!hasContent && !hasLinks) {
            return message.reply({ content: 'Please provide a song name.' });
        } else {
            try {
                const searchLink = message.content.match(/(https?:\/\/[^\s]+)/g)[0];
                message.react('<a:pukekospin:1311021344149868555>').catch(() => message.react('👍'));
                const response = await downloader.searchForLyrics(message, searchLink).catch(error => {
                    console.error('Error sending URL to downloader.js:', error);
                    return { success: false };
                });

                if (!response.success) {
                    return message.reply({ content: 'Error retrieving lyrics. Please try again later.' });
                }

                if (response.success) {
/*                     const properMoreFrom = response.artist ? `More from [${response.artist}](${response.artistURL})` : ' ';
 */                    const exampleEmbed = new EmbedBuilder()
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