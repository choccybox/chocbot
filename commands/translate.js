const altnames = ['translate', 'trans', 'tl'];
const quickdesc = 'translates text from autodetected language to English, or from one specified language to another.';

const dotenv = require('dotenv');
dotenv.config();
const { translate } = require('@vitalets/google-translate-api');
const ISO6391 = require('iso-639-1');

module.exports = {
    run: async function handleMessage(message, client, isChained) {
        function getLanguageCode(input) {
            const lowerInput = input.toLowerCase();
            if (ISO6391.validate(lowerInput)) return lowerInput;
            const code = ISO6391.getCode(lowerInput);
            if (code) return code;
            const commonAbbreviations = {
                es: 'es','spa': 'es', fr: 'fr','fre': 'fr',
                de: 'de','ger': 'de', it: 'it','ita': 'it',
                pt: 'pt','por': 'pt', ru: 'ru','rus': 'ru',
                ja: 'ja','jpn': 'ja', zh: 'zh','chi': 'zh',
                ko: 'ko','kor': 'ko', ar: 'ar','ara': 'ar',
                en: 'en','eng': 'en'
            };
            return commonAbbreviations[lowerInput] || null;
        }

        if (message.content.includes('help')) {
            const commandParts = message.content.trim().split(' ');
            const commandUsed = altnames.find(name => commandParts.some(part => part.endsWith(name) || part === name));
            return message.reply({
                content: `${quickdesc}\n` +
                    `### example: \n\`${commandUsed}:spanish never gonna give you up\`, \`${commandUsed} 今天汉漆 香肠 蟹桌\`\n` +
                    `### aliases:\n\`${altnames.join(', ')}\`\n`
            });
        }

        try {
            const commandParts = message.content.trim().split(' ');
            const firstPart = commandParts[0];
            
            let targetLanguage = 'en';
            let textToTranslate = '';

            if (firstPart.includes(':')) {
                const [, langSpec] = firstPart.split(':');
                const langCode = getLanguageCode(langSpec);
                if (langCode) {
                    targetLanguage = langCode;
                }
                textToTranslate = commandParts.slice(1).join(' ');
            } else {
                textToTranslate = commandParts.slice(1).join(' ');
            }

            if (!textToTranslate.trim()) {
                return message.reply({ content: 'Please provide text to translate.' });
            }

            // Detect the source language first
            const detectionResult = await translate(textToTranslate, { to: 'en' });
            const detectedSourceLang = detectionResult.from?.language?.iso || 'auto';

            // Then translate from detected source language to the chosen targetLanguage
            const result = await translate(textToTranslate, { from: detectedSourceLang, to: targetLanguage });

            return message.reply({ content: result.text });

        } catch (error) {
            console.error('Translation error:', error);
            return message.reply({ content: 'Sorry, I couldn\'t translate that text. Please try again.' });
        }
    }
};
