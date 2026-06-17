const altnames = ["freaky", "freak"];
const quickdesc = "makes your text 𝓯𝓻𝓮𝓪𝓴𝔂";

const dotenv = require("dotenv");
dotenv.config();
const fs = require("fs");
const { SlashCommandBuilder } = require("discord.js");
const freakyfont = fs.readFileSync("./database/freakyfont.json", "utf8");

module.exports = {
  name: "freaky",
  altnames,
  quickdesc,
  slashCommand: new SlashCommandBuilder()
    .setName("freaky")
    .setDescription("Makes your text 𝓯𝓻𝓮𝓪𝓴𝔂")
    .addStringOption((option) =>
      option
        .setName("text")
        .setDescription("Text to transform")
        .setRequired(true),
    ),
  help: {
    description: "Makes your text 𝓯𝓻𝓮𝓪𝓴𝔂",
    usage: "/freaky <text>",
    examples: ['/freaky "Hello World"'],
    options: "**text:** Text to transform",
  },
  buildSlashMessage: function buildSlashMessage(interaction) {
    return { content: `freaky ${interaction.options.getString("text")}` };
  },
  run: async function handleMessage(
    message,
    client,
    currentAttachments,
    isChained,
  ) {
    if (message.content.includes("help")) {
      const commandParts = message.content.trim().split(" ");
      const commandUsed = altnames.find((name) =>
        commandParts.some((part) => part.endsWith(name) || part === name),
      );
      return message.reply({
        content:
          `${quickdesc}\n` +
          `### usage:\n\`${commandUsed}:text\`` +
          `### Aliases:\n\`${altnames.join(", ")}\``,
      });
    }
    // check if text has any text after the command
    const text = message.content.split(" ").slice(1).join(" ");
    if (!text) {
      return message.reply({ content: "Please provide some text to convert." });
    } else {
      // Parse the freakyfont JSON
      const freakyMap = JSON.parse(freakyfont);

      // remove text before the command, freak:word -> word
      const text = message.content
        .split(" ")
        .slice(1)
        .join(" ")
        .split(":")
        .slice(-1)[0];

      // Convert each character using the mapping
      const freakyText = text
        .split("")
        .map((char) => {
          return freakyMap[char] || char;
        })
        .join("");

      // send the freaky text to the channel
      message.reply({ content: freakyText });
    }
  },
};
