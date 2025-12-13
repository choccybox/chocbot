const altnames = ['convert', 'conv'];
const quickdesc = 'converts a file to different format based on uploaded file type or specified in the command.';

const dotenv = require('dotenv');
dotenv.config();
const fs = require('fs');
const axios = require('axios');
const path = require('path');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const conversionDecider = require('../backbone/convertManager.js');

module.exports = {
    run: async function handleMessage(message, client, currentAttachments, isChained) {
        if (message.content.includes('help')) {
            const commandParts = message.content.trim().split(' ');
            const commandUsed = altnames.find(name => commandParts.some(part => part.endsWith(name) || part === name))
            return message.reply({
                content: `${quickdesc}\n` +
                    `### requirements: attachment\n` +
                    `### arguments: png, jpg, jpeg, gif, webp, mp4, avi, mov, wmv, mkv, webm, flv, mpeg, mpg, 3gp\n` +
                    `### examples:\n\`${commandUsed}:gif\` \`${commandUsed}\`\n` +
                    `### aliases:\n\`${altnames.join(', ')}\``,
            });
        }

        const hasAttachment = currentAttachments || message.attachments;
        const firstAttachment = hasAttachment.size > 0 ? (hasAttachment instanceof Map ? Array.from(hasAttachment.values())[0] : hasAttachment.first()) : null;
        if (!firstAttachment) {
            return message.reply({ content: 'Please provide an audio or video file to process.' });
        }

        const randomName = message.author.id;
        const rnd5dig = Math.floor(Math.random() * 90000) + 10000;
        const mimeType = firstAttachment.contentType.toLowerCase();
        const currentFormat = firstAttachment.name.split('.').pop().toLowerCase();
        const filePath = `temp/${randomName}-CONV-${rnd5dig}.${currentFormat}`;

        const response = await axios({
            method: 'get',
            url: firstAttachment.url,
            responseType: 'arraybuffer'
        });

        console.log('downloading file to ' + filePath);
        fs.writeFileSync(filePath, response.data);
        console.log('file downloaded to ' + filePath);

        const imageTypes = ['png', 'gif', 'jpg', 'jpeg', 'webp', 'svg', 'heic'];
        const audioTypes = ['mp3', 'flac', 'wav', 'ogg', 'aac', 'm4a', 'opus', 'wma'];
        const videoTypes = ['mp4', 'gif', 'avi', 'mov', 'wmv', 'mkv', 'webm', 'flv', 'mpeg', 'mpg', '3gp'];
        const fileType = mimeType.startsWith('image/') ? 'image' :
            mimeType.startsWith('video/') ? 'video' :
            mimeType.startsWith('audio/') ? 'audio' : 'unknown';

        console.log('file type: ' + fileType);

        // Check if format is specified in message
        const commandParts = message.content.split(':');
        if (commandParts.length > 1) {
            const conversionFormat = commandParts[1].toLowerCase();
            // Create a unique array of formats to check against
            const validFormats = [...new Set([...imageTypes, ...audioTypes, ...videoTypes])];
            
            if (!validFormats.includes(conversionFormat)) {
            return message.reply({ content: `Invalid or unsupported format: ${conversionFormat}` });
            }
            
            if (conversionFormat === currentFormat) {
            return message.reply({ content: `File is already in ${conversionFormat} format` });
            }

            // if user wants to convert video to image, reply with a warning (except for GIF)
            if (fileType === 'video' && imageTypes.includes(conversionFormat) && conversionFormat !== 'gif') {
            return message.reply({ content: `Converting video to image isn't supported` });
            }

            const outputFilePath = `temp/${randomName}-CONVDONE-${rnd5dig}.${conversionFormat}`;
            console.log(`User ${message.author.tag} chose to convert to ${conversionFormat}`);

            try {
            message.react('<a:pukekospin:1311021344149868555>').catch(() => message.react('👍'));
            console.log(`converting from **${currentFormat}** to **${conversionFormat}** (file name: ${filePath} -> ${outputFilePath})`);
            const response = await conversionDecider.conversionDecider(message, filePath, outputFilePath, conversionFormat);

            if (!response || !response.success) {
                return message.reply({ content: response?.message || 'Conversion failed. Please try again.' });
            }

            const fileSize = fs.statSync(outputFilePath).size;
            const isFileTooLarge = fileSize >= 10 * 1024 * 1024; // 10 MB
            
            let replyContent = `${(response.originalSize / 1024).toFixed(2)} KB -> ${(response.newSize / 1024).toFixed(2)} KB (${response.sizeChangeDirection}${Math.abs(response.sizeDifferenceBits / 1024).toFixed(2)} KB/${response.sizeChangeDirection}${Math.abs(response.sizeDifferencePercentage).toFixed(2)}%)\n`;
            
            // Use env variable for delete timeout, default to 5 minutes for large files, 30 seconds for small files
            const deleteDelay = isFileTooLarge 
                ? (parseInt(process.env.FILE_DELETE_TIMEOUT) || 300000) 
                : 30000;
            const deleteMinutes = Math.floor(deleteDelay / 60000);
            
            if (isFileTooLarge) {
                const encodedFileName = encodeURIComponent(outputFilePath.split('/').pop()).replace(/%20/g, ' ');
                const fileUrl = `${process.env.UPLOADURL}/temp/${encodedFileName}`;
                replyContent += `\nFile is too large to send. You can download it from [here](${fileUrl}).\nYour file will be deleted from the servers in ${deleteMinutes} minutes.`;
                await message.reply({ content: replyContent });
            } else {
                const fileData = fs.readFileSync(outputFilePath);
                await message.reply({
                content: replyContent,
                files: [{ attachment: fileData, name: outputFilePath.split('/').pop() }]
                });
            }

            // Delete files with appropriate delay
            
            setTimeout(() => {
                const tempDir = './temp';
                const patternConv = new RegExp(`${randomName}-CONV-${rnd5dig}`);
                const patternConvDone = new RegExp(`${randomName}-CONVDONE-${rnd5dig}`);
                
                fs.readdirSync(tempDir).forEach(file => {
                if (patternConv.test(file) || patternConvDone.test(file)) {
                    try {
                    fs.unlinkSync(path.join(tempDir, file));
                    console.log(`Cleaned up file: ${file}`);
                    } catch (err) {
                    console.error(`Error deleting file ${file}:`, err);
                    }
                }
                });
            }, deleteDelay);
            } catch (error) {
            return message.reply({ content: `Error converting to ${conversionFormat}: ${error.message}` });
            }
            return;
        }

        // Show buttons only if no format was specified
        const createButtons = (formats) => {
            return formats.filter(f => f !== currentFormat).map(format => {
                return new ButtonBuilder()
                    .setCustomId(`convert_${format}_${randomName}_${rnd5dig}`)
                    .setLabel(format.toUpperCase())
                    .setStyle(ButtonStyle.Primary);
            });
        };

        let buttons = [];
        if (fileType === 'image') {
            buttons = createButtons(imageTypes);
        } else if (fileType === 'audio') {
            buttons = createButtons(audioTypes);
        } else if (fileType === 'video') {
            buttons = createButtons([...videoTypes, ...audioTypes]);
        }

        if (buttons.length === 0) {
            return message.reply({ content: 'No conversion options available for this file type.' });
        }

        const rows = [];
        for (let i = 0; i < buttons.length; i += 5) {
            const row = new ActionRowBuilder().addComponents(buttons.slice(i, i + 5));
            rows.push(row);
        }

        const reply = await message.reply({
            content: `Select format to convert to:`,
            components: rows
        });

        const collector = message.channel.createMessageComponentCollector({
            filter: i => i.customId.startsWith('convert_') &&
                i.customId.includes(randomName) &&
                i.customId.includes(rnd5dig),
            time: 60000
        });

        collector.on('collect', async interaction => {
            const conversionFormat = interaction.customId.split('_')[1];
            const outputFilePath = `temp/${randomName}-CONVDONE-${rnd5dig}.${conversionFormat}`;

            await interaction.deferReply();

            try {
                message.react('<a:pukekospin:1311021344149868555>').catch(() => message.react('👍'));
                const response = await conversionDecider.conversionDecider(message, filePath, outputFilePath, conversionFormat);

                if (!response || !response.success) {
                    return interaction.editReply({ content: response?.message || 'Conversion failed. Please try again.' });
                }

                const fileSize = fs.statSync(outputFilePath).size;
                const isFileTooLarge = fileSize >= 10 * 1024 * 1024; // 10 MB
                
                let replyContent = `${(response.originalSize / 1024).toFixed(2)} KB -> ${(response.newSize / 1024).toFixed(2)} KB (${response.sizeChangeDirection}${Math.abs(response.sizeDifferenceBits / 1024).toFixed(2)} KB/${response.sizeChangeDirection}${Math.abs(response.sizeDifferencePercentage).toFixed(2)}%)\n`;
                
                // Use env variable for delete timeout (in minutes), default to 5 minutes for large files, 30 seconds for small files
                const deleteDelay = isFileTooLarge 
                    ? ((parseInt(process.env.FILE_DELETE_TIMEOUT) || 5) * 60000) // Convert minutes to ms
                    : 30000;
                const deleteMinutes = Math.floor(deleteDelay / 60000);
                
                if (isFileTooLarge) {
                    const encodedFileName = encodeURIComponent(outputFilePath.split('/').pop()).replace(/%20/g, ' ');
                    const fileUrl = `${process.env.UPLOADURL}/temp/${encodedFileName}`;
                    replyContent += `\nFile is too large to send. You can download it from [here](${fileUrl}).\nYour file will be deleted from the servers in ${deleteMinutes} minutes.`;
                    await interaction.editReply({
                        content: replyContent,
                        components: []
                    });
                } else {
                    const fileData = fs.readFileSync(outputFilePath);
                    await interaction.editReply({
                        content: replyContent,
                        files: [{ attachment: fileData, name: outputFilePath.split('/').pop() }],
                        components: []
                    });
                }

                // Delete files with appropriate delay
                
                setTimeout(() => {
                    const tempDir = './temp';
                    const patternConv = new RegExp(`${randomName}-CONV-${rnd5dig}`);
                    const patternConvDone = new RegExp(`${randomName}-CONVDONE-${rnd5dig}`);
                    
                    fs.readdirSync(tempDir).forEach(file => {
                        if (patternConv.test(file) || patternConvDone.test(file)) {
                            try {
                                fs.unlinkSync(path.join(tempDir, file));
                                console.log(`Cleaned up file: ${file}`);
                            } catch (err) {
                                console.error(`Error deleting file ${file}:`, err);
                            }
                        }
                    });
                    
                    reply.delete().catch(console.error);
                    collector.stop();
                }, deleteDelay);
            } catch (error) {
                await interaction.editReply({
                    content: `Error converting to ${conversionFormat}: ${error.message}`
                });
                collector.stop();
            }
        });

        collector.on('end', () => {
            reply.edit({ components: [] }).catch(() => { });
        });
    }
}
