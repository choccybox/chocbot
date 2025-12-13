const altnames = ['gtacall', 'gta', 'call', 'ifruit'];
const quickdesc = 'Overlays your or specified user\'s pfp and username/nickname onto the GTA iFruit call screen';

const dotenv = require('dotenv');
dotenv.config();
const fs = require('fs');
const axios = require('axios');
const sharp = require('sharp');
const { generate } = require('text-to-image');

module.exports = {
    run: async function handleMessage(message) {
        if (message.content.includes('help')) {
            const commandParts = message.content.trim().split(' ');
            const commandUsed = altnames.find(name => commandParts.some(part => part.endsWith(name) || part === name))
            return message.reply({
                content: `${quickdesc}\n` +
                    `### Usage:\n`+
                    `\`${commandUsed}\` - your pfp + display name\n` +
                    `\`${commandUsed} @user\` - their pfp + display name\n` +
                    `\`${commandUsed} @user1 @user2\` - user1's pfp + user2's display name\n` +
                    `\`${commandUsed} CustomName\` - your pfp + custom name\n` +
                    `\`${commandUsed} @user CustomName\` - their pfp + custom name\n` +
                    `### Aliases:\n\`${altnames.join(', ')}\``,
            });
        }

        try {
            // Parse mentions and remaining text
            const mentions = Array.from(message.mentions.users.values());
            // Remove command prefix (e.g., "?", "!") and command name
            const commandPattern = new RegExp(`^[!?.]*(${altnames.join('|')})\\s*`, 'i');
            const contentWithoutCommand = message.content.replace(commandPattern, '').trim();
            const contentWithoutMentions = contentWithoutCommand.replace(/<@!?\d+>/g, '').trim();
            
            // Determine pfp and name sources
            let pfpUser = message.author;
            let displayName = null;
            
            if (mentions.length === 0) {
            // No mentions: use author's pfp
            pfpUser = message.author;
            // Custom name if provided, otherwise author's display name
            displayName = contentWithoutMentions || null;
            } else if (mentions.length === 1) {
            // One mention: use their pfp
            pfpUser = mentions[0];
            // Custom name if provided, otherwise mentioned user's display name
            displayName = contentWithoutMentions || null;
            } else {
            // Two+ mentions: first user's pfp, second user's display name
            pfpUser = mentions[0];
            const nameUser = mentions[1];
            if (message.guild) {
                const member = await message.guild.members.fetch(nameUser.id);
                displayName = member.displayName || member.nickname || nameUser.globalName || nameUser.username;
            } else {
                displayName = nameUser.globalName || nameUser.username;
            }
            }

            // Get display name if not already set
            if (!displayName) {
            if (message.guild) {
                const member = await message.guild.members.fetch(pfpUser.id);
                displayName = member.displayName || member.nickname || pfpUser.globalName || pfpUser.username;
            } else {
                displayName = pfpUser.globalName || pfpUser.username;
            }
            }

            displayName = displayName.toUpperCase();

            // Get profile picture URL
            const avatarURL = pfpUser.displayAvatarURL({ extension: 'png', size: 256 });

            const userName = message.author.id;
            const rnd5dig = Math.floor(Math.random() * 90000) + 10000;

            message.react('<a:pukekospin:1311021344149868555>').catch(() => message.react('👍'));

            // Download and resize profile picture
            const avatarResponse = await axios.get(avatarURL, { responseType: 'arraybuffer' });
            const resizedAvatar = await sharp(avatarResponse.data)
                .resize(232, 232)
                .toBuffer();
            const avatarPath = `temp/${userName}-AVATAR-${rnd5dig}.png`;
            fs.writeFileSync(avatarPath, resizedAvatar);

            // Generate text image for display name
            const dataUri = await generate(displayName, {
                debug: false,
                maxWidth: 850,
                fontSize: 75,
                fontPath: 'fonts/Inter.ttf',
                fontFamily: 'Inter 18pt',
                fontWeight: '400',
                bgColor: 'transparent',
                textColor: '#b9b9bb',
                textAlign: 'left',
            });
            const base64Data = dataUri.replace(/^data:image\/png;base64,/, '');
            const textPath = `temp/${userName}-TEXT-${rnd5dig}.png`;
            fs.writeFileSync(textPath, base64Data, 'base64');

            // Overlay avatar and text onto base iFruit image
            const outputPath = `temp/${userName}-IFRUIT-${rnd5dig}.gif`;
            const compositeImage = await sharp('images/ifruit.png')
                .composite([
                    { input: avatarPath, top: 444, left: 142 },
                    { input: textPath, top: 315, left: 136 }
                ])
                .toBuffer();

            // Convert to GIF
            await sharp(compositeImage, { animated: true })
                .gif()
                .toFile(outputPath);

            // Send the final image
            message.reply({
                files: [{ attachment: outputPath }]
            });

            // Cleanup temporary files (keep 5 seconds for this type of file)
            const deleteDelay = 5000;
            setTimeout(() => {
                [avatarPath, textPath, outputPath].forEach(path => {
                    try {
                        fs.unlinkSync(path);
                    } catch (err) {
                        console.error(`Failed to delete ${path}:`, err);
                    }
                });
            }, deleteDelay);

        } catch (error) {
            console.error('Error processing iFruit call:', error);
            return message.reply({ content: `Error processing the image: ${error.message}` });
        }
    }
};
