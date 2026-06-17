const altnames = ["translate", "trans", "tl"];
const quickdesc =
  "translates text from autodetected language to English, or from one specified language to another.";

const dotenv = require("dotenv");
dotenv.config();
const axios = require("axios");
const { SlashCommandBuilder } = require("discord.js");
const {
  getLanguageCode,
  getSupportedLanguageCodes,
  getLanguageAutocompleteChoices,
} = require("../backbone/translateLanguages");

const configuredLibreTranslateUrl = process.env.LIBRETRANSLATE_URL;
const libreTranslateUrl = /^https?:\/\//i.test(configuredLibreTranslateUrl)
  ? configuredLibreTranslateUrl.replace(/\/$/, "")
  : `https://${configuredLibreTranslateUrl.replace(/\/$/, "")}`;
const libreTranslateApiKey = process.env.LIBRETRANSLATE_API_KEY;

module.exports = {
  name: "translate",
  altnames,
  quickdesc,
  slashCommand: new SlashCommandBuilder()
    .setName("translate")
    .setDescription(
      "Translates text from autodetected language to English or specified language",
    )
    .addStringOption((option) =>
      option
        .setName("text")
        .setDescription("Text to translate")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("to")
        .setDescription("Target language (type to search, defaults to English)")
        .setAutocomplete(true)
        .setRequired(false),
    ),
  help: {
    description:
      "Translates text from autodetected language to English or another target language",
    usage: "/translate <text> [to]",
    examples: [
      '/translate "Hello world"',
      '/translate "Bonjour" to:English',
      '/translate "Hello" to:Spanish',
    ],
    options:
      "**to:** Target language with autocomplete (optional, defaults to English). Source language is auto-detected.",
  },
  autocomplete: async function autocomplete(interaction) {
    const focusedOption = interaction.options.getFocused(true);
    if (focusedOption.name !== "to") return interaction.respond([]);
    return interaction.respond(
      getLanguageAutocompleteChoices(focusedOption.value),
    );
  },
  buildSlashMessage: function buildSlashMessage(interaction) {
    const text = interaction.options.getString("text");
    const rawTargetLanguage = interaction.options.getString("to");
    const targetLanguage = rawTargetLanguage
      ? getLanguageCode(rawTargetLanguage)
      : null;

    if (rawTargetLanguage && !targetLanguage) {
      return {
        error: `Unsupported target language: ${rawTargetLanguage}. Start typing in the \`to\` field and pick a language from autocomplete, or use one of: ${getSupportedLanguageCodes().join(", ")}`,
      };
    }

    return {
      content: `${targetLanguage ? `translate:${targetLanguage}` : "translate"} ${text}`,
    };
  },
  run: async function handleMessage(message, client, isChained) {
    if (message.content.includes("help")) {
      const commandParts = message.content.trim().split(" ");
      const commandUsed = altnames.find((name) =>
        commandParts.some((part) => part.endsWith(name) || part === name),
      );
      return message.reply({
        content:
          `${quickdesc}\n` +
          `### example: \n\`${commandUsed}:spanish never gonna give you up\`, \`${commandUsed} 今天汉漆 香肠 蟹桌\`\n` +
          `### aliases:\n\`${altnames.join(", ")}\`\n` +
          `### supported target languages:\n\`${getSupportedLanguageCodes().join(", ")}\`\n`,
      });
    }

    try {
      const commandParts = message.content.trim().split(" ");
      const firstPart = commandParts[0];

      let targetLanguage = "en";
      let textToTranslate = "";

      if (firstPart.includes(":")) {
        const [, langSpec] = firstPart.split(":");
        const langCode = getLanguageCode(langSpec);
        if (!langCode) {
          return message.reply({
            content: `Unsupported target language: ${langSpec}. Use /translate and pick a language from autocomplete, or try one of: ${getSupportedLanguageCodes().join(", ")}`,
          });
        }
        targetLanguage = langCode;
        textToTranslate = commandParts.slice(1).join(" ");
      } else {
        textToTranslate = commandParts.slice(1).join(" ");
      }

      if (!textToTranslate.trim()) {
        return message.reply({ content: "Please provide text to translate." });
      }

      const basePayload = libreTranslateApiKey
        ? { api_key: libreTranslateApiKey }
        : {};

      console.log(
        `LibreTranslate request: url=${libreTranslateUrl}, source=auto, target=${targetLanguage}`,
      );

      const translationResponse = await axios.post(
        `${libreTranslateUrl}/translate`,
        {
          q: textToTranslate,
          source: "auto",
          target: targetLanguage,
          format: "text",
          ...basePayload,
        },
      );

      return message.reply({
        content: translationResponse.data.translatedText,
      });
    } catch (error) {
      console.error("Translation error:", error);
      return message.reply({
        content: "Sorry, I couldn't translate that text. Please try again.",
      });
    }
  },
};
