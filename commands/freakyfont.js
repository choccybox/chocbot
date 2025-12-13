const altnames = ['freaky', 'freak']
const quickdesc = 'makes your text 𝓯𝓻𝓮𝓪𝓴𝔂';

const dotenv = require('dotenv');
dotenv.config();
const fs = require('fs');
const { SlashCommandBuilder } = require('discord.js');
const freakyfont = fs.readFileSync('./database/freakyfont.json', 'utf8');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('freaky')
        .setDescription(quickdesc)
        .addStringOption(option =>
            option.setName('text')
                .setDescription('The text to convert to freaky font')
                .setRequired(true)),
    
    async execute(interaction, client) {
        const text = interaction.options.getString('text');
        
        // Parse the freakyfont JSON
        const freakyMap = JSON.parse(freakyfont);
        
        // Convert each character using the mapping
        const freakyText = text.split('').map(char => {
            return freakyMap[char] || char;
        }).join('');
        
        // Send the freaky text
        await interaction.reply({ content: freakyText });
    },
    
    run: async function handleMessage(message, client, currentAttachments, isChained) {
        if (message.content.includes('help')) {
            const commandParts = message.content.trim().split(' ');
            const commandUsed = altnames.find(name => commandParts.some(part => part.endsWith(name) || part === name))
            return message.reply({
                content: `${quickdesc}\n` +
                    `### usage:\n\`${commandUsed}:text\`` +
                    `### Aliases:\n\`${altnames.join(', ')}\``,
            });
        }
        // check if text has any text after the command
        const text = message.content.split(' ').slice(1).join(' ');
        if (!text) {
            return message.reply({ content: 'Please provide some text to convert.' });
        } else {
            // Parse the freakyfont JSON
            const freakyMap = JSON.parse(freakyfont);

            // remove text before the command, freak:word -> word
            const text = message.content.split(' ').slice(1).join(' ').split(':').slice(-1)[0];
            
            // Convert each character using the mapping
            const freakyText = text.split('').map(char => {
            return freakyMap[char] || char;
            }).join('');
            
            // send the freaky text to the channel
            message.reply({ content: freakyText });
        }
    }
}