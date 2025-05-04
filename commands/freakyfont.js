const altnames = ['freaky', 'freak']
const quickdesc = 'makes your text 𝓯𝓻𝓮𝓪𝓴𝔂';

const dotenv = require('dotenv');
dotenv.config();
const fs = require('fs');
const freakyfont = fs.readFileSync('./database/freakyfont.json', 'utf8');

module.exports = {
    run: async function handleMessage(message, client, currentAttachments, isChained) {
        if (message.content.includes('help')) {
            const commandUsed = message.content.split(' ').find(part => part !== 'help' && !part.startsWith('<@'));
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