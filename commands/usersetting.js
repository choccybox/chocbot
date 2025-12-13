const altnames = ['settings', 'setting', 'config'];
const quickdesc = 'View and modify your personal bot settings';

const fs = require('fs');
const path = require('path');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    run: async function handleMessage(message, client) {
        if (message.content.includes('help')) {
            const commandParts = message.content.trim().split(' ');
            const commandUsed = altnames.find(name => commandParts.some(part => part.endsWith(name) || part === name));
            return message.reply({
                content: `${quickdesc}\n` +
                    `### Example:\n\`${commandUsed}\`\n` +
                    `### Aliases:\n\`${altnames.join(', ')}\``,
            });
        }

        const userId = message.author.id;
        const settingsPath = path.join(__dirname, '../database/usersetting.json');
        
        // Load user settings
        let userSettings = {};
        if (fs.existsSync(settingsPath)) {
            userSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        }
        
        // Initialize user settings if not exists
        if (!userSettings[userId]) {
            userSettings[userId] = {
                tiktokwatermark: true,
                preferredaudioformat: 'mp3'
            };
            fs.writeFileSync(settingsPath, JSON.stringify(userSettings, null, 2));
        }
        
        const currentSettings = userSettings[userId];
        
        // Create buttons for settings
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`tiktok_watermark_${userId}`)
                    .setLabel(`TikTok Watermark: ${currentSettings.tiktokwatermark ? 'ON' : 'OFF'}`)
                    .setStyle(currentSettings.tiktokwatermark ? ButtonStyle.Success : ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId(`audio_format_${userId}`)
                    .setLabel(`Audio Format: ${currentSettings.preferredaudioformat.toUpperCase()}`)
                    .setStyle(ButtonStyle.Primary)
            );
        
        return message.reply({
            content: '⚙️ **Your Bot Settings**\n\n' +
                `TikTok Watermark: **${currentSettings.tiktokwatermark ? 'Enabled' : 'Disabled'}**\n` +
                `Preferred Audio Format: **${currentSettings.preferredaudioformat.toUpperCase()}**\n\n` +
                `Click the buttons below to toggle settings:`,
            components: [row]
        });
    }
};
