const altnames = ["abquote"];
const quickdesc =
  "Creates an Anthony Bourdain quote image with two custom text fields";

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { createCanvas, registerFont } = require("canvas");
const { SlashCommandBuilder } = require("discord.js");

const BASE_IMAGE_PATH = path.join(
  __dirname,
  "..",
  "..",
  "images",
  "anthony bourdain quote.png",
);
const FONT_PATH = path.join(__dirname, "..", "..", "fonts", "MinionPro.ttf");
const FONT_FAMILY = "MinionPro";
const FONT_SIZE = 36;
const MAX_LENGTH = 50;
const DELETE_DELAY = 5000;

const TEXT_FIELDS = [
  { key: "text1", left: 220, top: 339, maxWidth: 290 },
  { key: "text2", left: 15, top: 420, maxWidth: 300 },
];

let fontRegistered = false;

function registerMinionPro() {
  if (fontRegistered) return;

  registerFont(FONT_PATH, {
    family: FONT_FAMILY,
    weight: "400",
  });
  fontRegistered = true;
}

function validateText(text, fieldName) {
  if (typeof text !== "string" || text.length === 0) {
    throw new Error(`${fieldName} is required.`);
  }

  if (text.length > MAX_LENGTH) {
    throw new Error(`${fieldName} must be ${MAX_LENGTH} characters or fewer.`);
  }
}

function getSlashText(message) {
  if (
    message.abquoteText1 !== undefined ||
    message.abquoteText2 !== undefined
  ) {
    return {
      text1: message.abquoteText1,
      text2: message.abquoteText2,
    };
  }

  const match = message.content.match(
    /^abquote\s+([\s\S]*?)\s+\|\s+([\s\S]*)$/i,
  );
  if (!match) {
    throw new Error("Use /abquote with both required text fields.");
  }

  return {
    text1: match[1],
    text2: match[2],
  };
}

async function createABQuoteImage(text1, text2, outputPath) {
  validateText(text1, "text1");
  validateText(text2, "text2");
  registerMinionPro();
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const metadata = await sharp(BASE_IMAGE_PATH).metadata();
  const canvas = createCanvas(metadata.width, metadata.height);
  const ctx = canvas.getContext("2d");

  ctx.font = `400 ${FONT_SIZE}px "${FONT_FAMILY}"`;
  ctx.fillStyle = "white";
  ctx.textBaseline = "top";

  for (const field of TEXT_FIELDS) {
    const text = field.key === "text1" ? text1 : text2;
    const measuredWidth = ctx.measureText(text).width;
    const scaleX =
      measuredWidth > field.maxWidth ? field.maxWidth / measuredWidth : 1;

    ctx.save();
    ctx.translate(field.left, field.top);
    ctx.scale(scaleX, 1);
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  const textOverlay = canvas.toBuffer("image/png");

  await sharp(BASE_IMAGE_PATH)
    .composite([{ input: textOverlay, top: 0, left: 0 }])
    .png()
    .toFile(outputPath);

  return outputPath;
}

module.exports = {
  name: "abquote",
  altnames,
  quickdesc,
  slashCommand: new SlashCommandBuilder()
    .setName("abquote")
    .setDescription("Create an Anthony Bourdain quote image")
    .addStringOption((option) =>
      option
        .setName("text1")
        .setDescription("Once you've ...")
        .setRequired(true)
        .setMaxLength(MAX_LENGTH),
    )
    .addStringOption((option) =>
      option
        .setName("text2")
        .setDescription("you'll never stop wanting to beat ... to death")
        .setRequired(true)
        .setMaxLength(MAX_LENGTH),
    ),
  help: {
    description:
      "Create an Anthony Bourdain quote image with two custom text fields",
    usage: "/abquote <text1> <text2>",
    examples: ['/abquote text1:"used windows" text2:"Bill Gates"'],
    options:
      "**text1:** First text field, max 50 characters\n**text2:** Second text field, max 50 characters",
  },
  buildSlashMessage: function buildSlashMessage(interaction) {
    const text1 = interaction.options.getString("text1");
    const text2 = interaction.options.getString("text2");
    return {
      content: `abquote ${text1} | ${text2}`,
      messageProps: {
        abquoteText1: text1,
        abquoteText2: text2,
      },
    };
  },
  run: async function handleMessage(message) {
    try {
      const { text1, text2 } = getSlashText(message);
      validateText(text1, "text1");
      validateText(text2, "text2");

      const userName = message.author.id;
      const rnd5dig = Math.floor(Math.random() * 90000) + 10000;
      const outputPath = path.join(
        "temp",
        `${userName}-ABQUOTE-${rnd5dig}.png`,
      );

      await message
        .react("<a:pukekospin:1311021344149868555>")
        .catch(() => message.react("👍"));
      await createABQuoteImage(text1, text2, outputPath);

      await message.reply({
        files: [{ attachment: outputPath }],
      });

      setTimeout(() => {
        try {
          fs.unlinkSync(outputPath);
        } catch (err) {
          if (err.code === "ENOENT") return;
          console.error(`Failed to delete ${outputPath}:`, err);
        }
      }, DELETE_DELAY);
    } catch (error) {
      console.error("Error processing Anthony Bourdain quote:", error);
      return message.reply({
        content: `Error processing the image: ${error.message}`,
      });
    }
  },
  createABQuoteImage,
};
