const altnames = ['gtacall', 'gta', 'call', 'ifruit'];
const quickdesc = 'Overlays your or specified user\'s pfp and username/nickname onto the GTA iFruit call screen';

const fs = require('fs');
const axios = require('axios');
const sharp = require('sharp');
const { generate } = require('text-to-image');

module.exports = {
    run: async function handleMessage(message, client, currentAttachments, isChained) {
        if (message.content.includes('help')) {
            const commandParts = message.content.trim().split(' ');
            const commandUsed = altnames.find(name => commandParts.some(part => part.endsWith(name) || part === name))
            return message.reply({
                content: `${quickdesc}\n` +
                    `### Arguments:\n`+
                    `\`@user\` use mentioned user's pfp and username\n` +
                    `\`:customname\` use custom name (e.g., \`${commandUsed}:packgod\`)\n` +
                    `### Examples:\n\`${commandUsed} @user\` \`${commandUsed}\` \`${commandUsed}:packgod\`\n` +
                    `### Aliases:\n\`${altnames.join(', ')}\``,
            });
        }

        try {
            // 1. Get target user and display name
            let targetUser = message.author;
            let displayName;
            
            // Check for custom name after colon
            const colonMatch = message.content.match(/:([\w\s]+)/);
            
            if (colonMatch) {
                // Use custom name
                displayName = colonMatch[1].trim().toUpperCase();
            } else if (message.mentions.users.size > 0) {
                // Use mentioned user
                targetUser = message.mentions.users.first();
                if (message.guild) {
                    const member = await message.guild.members.fetch(targetUser.id);
                    displayName = member.nickname || member.displayName || targetUser.username;
                } else {
                    displayName = targetUser.displayName || targetUser.username;
                }
                displayName = displayName.toUpperCase();
            } else {
                // Use command author
                if (message.guild) {
                    const member = await message.guild.members.fetch(targetUser.id);
                    displayName = member.nickname || member.displayName || targetUser.username;
                } else {
                    displayName = targetUser.displayName || targetUser.username;
                }
                displayName = displayName.toUpperCase();
            }

            // 3. Get user's profile picture URL (using 256 as it must be a power of 2)
            const avatarURL = targetUser.displayAvatarURL({ extension: 'png', size: 256 });

            const userName = message.author.id;
            const rnd5dig = Math.floor(Math.random() * 90000) + 10000;

            message.react('<a:pukekospin:1311021344149868555>').catch(() => message.react('👍'));

            // 4. Download and resize profile picture to 232x232, then to 50x50
            const avatarResponse = await axios.get(avatarURL, { responseType: 'arraybuffer' });
            const resizedAvatar = await sharp(avatarResponse.data)
                .resize(232, 232)
                .toBuffer();
            const avatarPath = `temp/${userName}-AVATAR-${rnd5dig}.png`;
            fs.writeFileSync(avatarPath, resizedAvatar);

            // 5. Generate text image for display name
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

            // 6. Overlay avatar and text onto base iFruit image
            const outputPath = `temp/${userName}-IFRUIT-${rnd5dig}.png`;
            await sharp('images/ifruit.png')
                .composite([
                    { input: avatarPath, top: 444, left: 142 }, // Adjust positions as needed
                    { input: textPath, top: 315, left: 136 }   // Adjust positions as needed
                ])
                .toFile(outputPath);

            // 7. Send the final image
            message.reply({
                files: [{ attachment: outputPath }]
            });
            message.reactions.removeAll().catch(console.error);

            // 8. Cleanup temporary files after 5 seconds
            setTimeout(() => {
                [avatarPath, textPath, outputPath].forEach(path => {
                    try {
                        fs.unlinkSync(path);
                    } catch (err) {
                        console.error(`Failed to delete ${path}:`, err);
                    }
                });
            }, 5000);

        } catch (error) {
            console.error('Error processing iFruit call:', error);
            return message.reply({ content: `Error processing the image: ${error.message}` });
        }
    }
};
