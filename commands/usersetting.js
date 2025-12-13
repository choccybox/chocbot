const altnames = ['usersettings', 'settings', 'userset', 'setting'];
const quickdesc = 'Modify user settings';

const fs = require('fs');
const axios = require('axios');
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('settings')
        .setDescription(quickdesc),
    
    async execute(interaction, client) {
        try {
            // Read user settings from database
            let userSettings = {};
            const dbPath = './database/usersetting.json';
            
            if (!fs.existsSync(dbPath)) {
                return interaction.reply({ content: 'No user settings database found.', ephemeral: true });
            }

            const data = fs.readFileSync(dbPath, 'utf8');
            userSettings = JSON.parse(data);

            const userId = interaction.user.id;
            const currentSettings = userSettings[userId];

            if (!currentSettings || Object.keys(currentSettings).length === 0) {
                return interaction.reply({ content: 'No settings found for your user.', ephemeral: true });
            }

            // Filter settings to only include those with descriptions
            const validSettings = Object.keys(currentSettings).filter(key => 
                !key.endsWith('desc') && currentSettings.hasOwnProperty(key + 'desc')
            );

            if (validSettings.length === 0) {
                return interaction.reply({ content: 'No displayable settings found for your user.', ephemeral: true });
            }

            // Dynamically create toggle buttons based on valid settings
            const buttons = validSettings.map(key => {
                const value = currentSettings[key];
                return new ButtonBuilder()
                    .setCustomId(`toggle_${key}_${userId}`)
                    .setLabel(`${key}: ${value ? 'ON' : 'OFF'}`)
                    .setStyle(value ? ButtonStyle.Success : ButtonStyle.Secondary);
            });

            const row = new ActionRowBuilder().addComponents(buttons);

            // Create content display with descriptions from file
            const contentLines = validSettings.map(key => {
                const value = currentSettings[key];
                const description = currentSettings[key + 'desc'];
                return `• **${key}**: \`${value ? 'Enabled' : 'Disabled'}\`\n  ↳ ${description}`;
            });

            const reply = await interaction.reply({
                content: `**Your Current Settings:**\n${contentLines.join('\n\n')}`,
                components: [row],
                fetchReply: true
            });

            // Button interaction collector
            const collector = reply.createMessageComponentCollector({ time: 60000 });

            collector.on('collect', async (buttonInteraction) => {
                if (!buttonInteraction.customId.endsWith(userId)) {
                    return buttonInteraction.reply({ content: 'These are not your settings!', ephemeral: true });
                }

                // Extract setting key from custom ID
                const settingKey = buttonInteraction.customId.replace(`toggle_`, '').replace(`_${userId}`, '');
                
                // Toggle the setting
                currentSettings[settingKey] = !currentSettings[settingKey];

                // Save to file
                userSettings[userId] = currentSettings;
                fs.writeFileSync(dbPath, JSON.stringify(userSettings, null, 2), 'utf8');

                // Update buttons
                const updatedButtons = validSettings.map(key => {
                    const value = currentSettings[key];
                    return new ButtonBuilder()
                        .setCustomId(`toggle_${key}_${userId}`)
                        .setLabel(`${key}: ${value ? 'ON' : 'OFF'}`)
                        .setStyle(value ? ButtonStyle.Success : ButtonStyle.Secondary);
                });

                const updatedRow = new ActionRowBuilder().addComponents(updatedButtons);

                const updatedContentLines = validSettings.map(key => {
                    const value = currentSettings[key];
                    const description = currentSettings[key + 'desc'];
                    return `• **${key}**: \`${value ? 'Enabled' : 'Disabled'}\`\n  ↳ ${description}`;
                });

                await buttonInteraction.update({
                    content: `**Your Current Settings:**\n${updatedContentLines.join('\n\n')}`,
                    components: [updatedRow]
                });
            });

            collector.on('end', () => {
                reply.edit({ components: [] }).catch(() => {});
            });

        } catch (error) {
            console.error('Error reading user settings:', error);
            return interaction.reply({ content: 'Error loading settings. Please try again.', ephemeral: true });
        }
    },
    
    run: async function handleMessage(message, client, currentAttachments, isChained) {
        if (message.content.includes('help')) {
            const commandParts = message.content.trim().split(' ');
            const commandUsed = altnames.find(name => commandParts.some(part => part.endsWith(name) || part === name))
            return message.reply({
                content: `${quickdesc}\n` +
                    `### Description:\n`+
                    `View and modify your personal settings\n` +
                    `### Examples:\n\`${commandUsed}\`\n` +
                    `### Aliases:\n\`${altnames.join(', ')}\``,
            });
        }

        try {
            // Read user settings from database
            let userSettings = {};
            const dbPath = './database/usersetting.json';
            
            if (!fs.existsSync(dbPath)) {
                return message.reply({ content: 'No user settings database found.' });
            }

            const data = fs.readFileSync(dbPath, 'utf8');
            userSettings = JSON.parse(data);

            const userId = message.author.id;
            const currentSettings = userSettings[userId];

            if (!currentSettings || Object.keys(currentSettings).length === 0) {
                return message.reply({ content: 'No settings found for your user.' });
            }

            // Filter settings to only include those with descriptions
            const validSettings = Object.keys(currentSettings).filter(key => 
                !key.endsWith('desc') && currentSettings.hasOwnProperty(key + 'desc')
            );

            if (validSettings.length === 0) {
                return message.reply({ content: 'No displayable settings found for your user.' });
            }

            // Dynamically create toggle buttons based on valid settings
            const buttons = validSettings.map(key => {
                const value = currentSettings[key];
                return new ButtonBuilder()
                    .setCustomId(`toggle_${key}_${userId}`)
                    .setLabel(`${key}: ${value ? 'ON' : 'OFF'}`)
                    .setStyle(value ? ButtonStyle.Success : ButtonStyle.Secondary);
            });

            const row = new ActionRowBuilder().addComponents(buttons);

            // Create content display with descriptions from file
            const contentLines = validSettings.map(key => {
                const value = currentSettings[key];
                const description = currentSettings[key + 'desc'];
                return `• **${key}**: \`${value ? 'Enabled' : 'Disabled'}\`\n  ↳ ${description}`;
            });

            const reply = await message.reply({
                content: `**Your Current Settings:**\n${contentLines.join('\n\n')}`,
                components: [row]
            });

            // Button interaction collector
            const collector = reply.createMessageComponentCollector({ time: 60000 });

            collector.on('collect', async (interaction) => {
                if (!interaction.customId.endsWith(userId)) {
                    return interaction.reply({ content: 'These are not your settings!', ephemeral: true });
                }

                // Extract setting key from custom ID
                const settingKey = interaction.customId.replace(`toggle_`, '').replace(`_${userId}`, '');
                
                // Toggle the setting
                currentSettings[settingKey] = !currentSettings[settingKey];

                // Save to file
                userSettings[userId] = currentSettings;
                fs.writeFileSync(dbPath, JSON.stringify(userSettings, null, 2), 'utf8');

                // Update buttons
                const updatedButtons = validSettings.map(key => {
                    const value = currentSettings[key];
                    return new ButtonBuilder()
                        .setCustomId(`toggle_${key}_${userId}`)
                        .setLabel(`${key}: ${value ? 'ON' : 'OFF'}`)
                        .setStyle(value ? ButtonStyle.Success : ButtonStyle.Secondary);
                });

                const updatedRow = new ActionRowBuilder().addComponents(updatedButtons);

                const updatedContentLines = validSettings.map(key => {
                    const value = currentSettings[key];
                    const description = currentSettings[key + 'desc'];
                    return `• **${key}**: \`${value ? 'Enabled' : 'Disabled'}\`\n  ↳ ${description}`;
                });

                await interaction.update({
                    content: `**Your Current Settings:**\n${updatedContentLines.join('\n\n')}`,
                    components: [updatedRow]
                });
            });

            collector.on('end', () => {
                reply.edit({ components: [] }).catch(() => {});
            });

        } catch (error) {
            console.error('Error reading user settings:', error);
            return message.reply({ content: 'Error loading settings. Please try again.' });
        }
    }
};
