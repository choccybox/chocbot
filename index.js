const {
  Client,
  GatewayIntentBits,
  Collection,
  REST,
  Routes,
  SlashCommandBuilder,
  WebhookClient,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const express = require("express");
const index = express();
const PORT = process.env.PORT || 3000;
const mimeType = require("mime-types");

index.listen(PORT, () => {});
// Serve static files from the "public" directory
index.use("/temp", express.static(path.join(__dirname, "temp")));

// Initialize error webhook if URL is provided
let errorWebhook = null;
if (process.env.ERROR_WEBHOOK_URL) {
  try {
    errorWebhook = new WebhookClient({ url: process.env.ERROR_WEBHOOK_URL });
    console.log("Error webhook initialized");
  } catch (err) {
    console.error("Failed to initialize error webhook:", err);
  }
}

// Global error reporter function
async function reportError(error, context = {}) {
  console.error("Error occurred:", error);

  if (!errorWebhook) return;

  try {
    const embed = new EmbedBuilder()
      .setTitle("🚨 Bot Error Detected")
      .setColor(0xff0000)
      .setTimestamp()
      .addFields(
        { name: "Error Type", value: error.name || "Unknown", inline: true },
        {
          name: "Error Message",
          value: (error.message || "No message").slice(0, 1024),
          inline: false,
        },
      );

    if (error.stack) {
      embed.addFields({
        name: "Stack Trace",
        value: `\`\`\`${error.stack.slice(0, 1000)}\`\`\``,
        inline: false,
      });
    }

    if (context.command) {
      embed.addFields({
        name: "Command",
        value: context.command,
        inline: true,
      });
    }

    if (context.user) {
      embed.addFields({
        name: "User",
        value: `${context.user.tag} (${context.user.id})`,
        inline: true,
      });
    }

    if (context.guild) {
      embed.addFields({
        name: "Guild",
        value: `${context.guild.name} (${context.guild.id})`,
        inline: true,
      });
    }

    await errorWebhook.send({ embeds: [embed] });
  } catch (webhookErr) {
    console.error("Failed to send error webhook:", webhookErr);
  }
}

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  reportError(error, { context: "Uncaught Exception" });
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (error) => {
  reportError(error, { context: "Unhandled Rejection" });
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMessageReactions,
  ],
  fetchAllMembers: true,
});

const {
  loadCommandRegistry,
  getApplicationCommands,
  buildTextCommandMap,
  buildCommandDescriptions,
  buildCommandHelp,
  findCommandEntry,
  getCommandAutocompleteChoices,
} = require("./backbone/commandRegistry");

const commandEntries = loadCommandRegistry();
const commands = buildTextCommandMap(commandEntries);
const quickdesc = buildCommandDescriptions(commandEntries);
const commandHelp = buildCommandHelp(commandEntries);

function normalizeInteractionOptions(options) {
  if (
    !options ||
    typeof options !== "object" ||
    options.ephemeral === undefined
  ) {
    return options;
  }

  const normalizedOptions = { ...options };
  if (normalizedOptions.ephemeral) {
    normalizedOptions.flags = (normalizedOptions.flags || 0) | 64;
  }
  delete normalizedOptions.ephemeral;
  return normalizedOptions;
}

function createAttachmentCollection() {
  const attachments = new Map();
  attachments.first = function first() {
    return this.values().next().value;
  };
  return attachments;
}

// Register slash commands on startup
async function registerSlashCommands() {
  const slashCommands = getApplicationCommands(commandEntries);
  const rest = new REST().setToken(process.env.TOKEN);

  try {
    console.log(
      "Started refreshing " +
        slashCommands.length +
        " application (/) commands.",
    );
    const data = await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: slashCommands },
    );
    console.log(
      "Successfully reloaded " + data.length + " application (/) commands.",
    );
  } catch (error) {
    console.error("Error registering slash commands:", error);
    await reportError(error, { context: "Slash Command Registration" });
  }
}

// Handle interactions (slash commands and autocomplete)
client.on("interactionCreate", async (interaction) => {
  if (interaction.isAutocomplete()) {
    if (interaction.commandName === "help") {
      return interaction.respond(
        getCommandAutocompleteChoices(
          commandEntries,
          interaction.options.getFocused(),
        ),
      );
    }

    const commandEntry = findCommandEntry(
      commandEntries,
      interaction.commandName,
    );
    if (
      !commandEntry ||
      typeof commandEntry.module.autocomplete !== "function"
    ) {
      return interaction.respond([]);
    }

    try {
      return await commandEntry.module.autocomplete(interaction);
    } catch (error) {
      console.error(
        "Error handling autocomplete for " + interaction.commandName + ":",
        error,
      );
      return interaction.respond([]).catch(() => {});
    }
  }

  if (!interaction.isChatInputCommand()) return;

  const commandName = interaction.commandName;

  if (commandName === "help") {
    const specificCommand = interaction.options.getString("command");

    if (!specificCommand) {
      const allCommandsHelp = Object.keys(commandHelp)
        .map((cmd) => "**/" + cmd + "** - " + commandHelp[cmd].description)
        .join("\n\n");

      return interaction.reply({
        embeds: [
          {
            title: "📚 Bot Commands Help",
            description:
              allCommandsHelp +
              "\n\n*Use /help command:<command_name> for detailed help on a specific command*",
            color: 0x5865f2,
            footer: { text: "All commands are only visible to you" },
          },
        ],
        flags: 64,
      });
    }

    const help = commandHelp[specificCommand];
    if (!help) {
      return interaction.reply({
        content: "Command `" + specificCommand + "` not found.",
        flags: 64,
      });
    }

    return interaction.reply({
      embeds: [
        {
          title: "📖 Help: /" + specificCommand,
          description: help.description,
          fields: [
            { name: "Usage", value: "`" + help.usage + "`", inline: false },
            {
              name: "Examples",
              value: help.examples.map((ex) => "`" + ex + "`").join("\n"),
              inline: false,
            },
            { name: "Options", value: help.options, inline: false },
          ],
          color: 0x5865f2,
        },
      ],
      flags: 64,
    });
  }

  const commandEntry = findCommandEntry(commandEntries, commandName);

  if (!commandEntry) {
    return interaction.reply({ content: "Command not found!", flags: 64 });
  }

  try {
    const command = commandEntry.module;
    console.log("Executing slash command: " + commandName);

    await interaction.deferReply({ flags: 64 });

    const slashMessage =
      typeof command.buildSlashMessage === "function"
        ? await command.buildSlashMessage(interaction)
        : { content: commandName };

    if (slashMessage.error) {
      return interaction.editReply({ content: slashMessage.error });
    }

    const mockAttachments = createAttachmentCollection();
    const slashAttachments = slashMessage.attachments || [];
    if (slashAttachments instanceof Map) {
      slashAttachments.forEach((attachment, id) =>
        mockAttachments.set(id, attachment),
      );
    } else {
      slashAttachments.forEach((attachment, index) => {
        mockAttachments.set(
          attachment.id || attachment.name || String(index),
          attachment,
        );
      });
    }

    let hasReplied = false;
    const emptyMentions = { users: new Map(), has: () => false };

    const mockMessage = {
      content: slashMessage.content || commandName,
      author: interaction.user,
      channel: interaction.channel,
      guild: interaction.guild,
      member: interaction.member,
      attachments: mockAttachments,
      mentions: slashMessage.mentions || emptyMentions,
      ...(slashMessage.messageProps || {}),
      deferred: interaction.deferred,
      replied: interaction.replied,
      editReply: async (options) => {
        try {
          hasReplied = true;
          return await interaction.editReply(
            normalizeInteractionOptions(options),
          );
        } catch (error) {
          console.error("Error editing reply:", error);
          throw error;
        }
      },
      react: async () => Promise.resolve(),
      reply: async (options) => {
        try {
          hasReplied = true;
          return await interaction.followUp(
            normalizeInteractionOptions(options),
          );
        } catch (error) {
          console.error("Error sending follow-up:", error);
          throw error;
        }
      },
    };

    const result = await command.run(
      mockMessage,
      client,
      mockAttachments.size > 0 ? mockAttachments : null,
    );

    if (result && typeof result === "string") {
      await interaction
        .followUp({ content: result, flags: 64 })
        .catch(console.error);
    } else if (!hasReplied && !interaction.replied) {
      await interaction
        .editReply({ content: "Command executed successfully!" })
        .catch(console.error);
    }
  } catch (error) {
    console.error("Error executing slash command " + commandName + ":", error);

    await reportError(error, {
      command: commandName,
      user: interaction.user,
      guild: interaction.guild,
      context: "Slash Command Execution",
    });

    try {
      if (interaction.deferred && !interaction.replied) {
        await interaction.editReply({
          content: "An error occurred while processing the command.",
        });
      } else if (!interaction.replied) {
        await interaction.reply({
          content: "An error occurred while processing the command.",
          flags: 64,
        });
      }
    } catch (replyError) {
      console.error("Failed to send error message:", replyError);
    }
  }
});

// Command metadata is loaded from each command module by commandRegistry.js.

index.get("/temp/:filename", (req, res) => {
  const filename = req.params.filename;
  const filepath = path.join(__dirname, "temp", filename);

  // Check if file exists
  fs.access(filepath, fs.constants.F_OK, (err) => {
    if (err) {
      return res.status(404).send("File not found");
    }

    // Determine MIME type based on file extension
    const mime = mimeType.lookup(filepath) || "application/octet-stream";

    // Set headers to force download
    res.set({
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": mime,
    });

    // Create and pipe a read stream with error handling
    const fileStream = fs.createReadStream(filepath);
    fileStream.on("error", (error) => {
      console.error("Error reading file:", error);
      res.status(500).send("Error downloading file");
    });

    fileStream.pipe(res);
  });
});

// Set up a route for the root URL
index.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "images", "pukeko.jpg"));
});

// Write the commands to a .json file
fs.writeFileSync("./database/commands.json", JSON.stringify(commands, null, 2));
fs.writeFileSync(
  "./database/commandsdesc.json",
  JSON.stringify(quickdesc, null, 2),
);

// Handle text commands (legacy support)
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(process.env.PREFIX || "!")) return;

  const args = message.content
    .slice((process.env.PREFIX || "!").length)
    .trim()
    .split(/ +/);
  const command = args.shift().toLowerCase();

  // Check if command exists in commands.json
  const commandData = commands[command];
  if (!commandData) return;

  try {
    const commandFile = require(
      path.join(__dirname, "commands", commandData.file),
    );
    console.log(`Executing text command: ${command}`);

    await commandFile.run(message, client);
  } catch (error) {
    console.error(`Error executing text command ${command}:`, error);
    await reportError(error, {
      command: command,
      user: message.author,
      guild: message.guild,
      context: "Text Command Execution",
    });

    try {
      await message.reply("An error occurred while processing the command.");
    } catch (replyError) {
      console.error("Failed to send error message:", replyError);
    }
  }
});

client.once("clientReady", async () => {
  // Register slash commands
  await registerSlashCommands();

  const tempDir = path.join(__dirname, "temp");

  // Create temp directory if it doesn't exist
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
    console.log("Created temp directory");
  } else {
    // Function to recursively delete files and folders
    const cleanDirectory = (dir) => {
      if (fs.existsSync(dir)) {
        fs.readdirSync(dir).forEach((file) => {
          const filePath = path.join(dir, file);
          if (fs.lstatSync(filePath).isDirectory()) {
            cleanDirectory(filePath); // Recursively clean subdirectories
            fs.rmdirSync(filePath); // Remove the empty folder
          } else {
            fs.unlinkSync(filePath); // Remove the file
          }
        });
      }
    };

    // Clean the temp directory
    cleanDirectory(tempDir);

    // Memory cleanup interval - runs every 6 hours
    setInterval(
      () => {
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
          console.log("Forced garbage collection");
        }

        // Log current memory usage
        const memUsage = process.memoryUsage();
        console.log("Memory usage after cleanup:", {
          rss: Math.round(memUsage.rss / 1024 / 1024) + " MB",
          heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + " MB",
          heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + " MB",
        });
      },
      6 * 60 * 60 * 1000,
    ); // 6 hours in milliseconds
  }

  // get all users in every guild and save their ids and usernames to a .json file, give each user 2 variables: tiktokwatermark (default true) and preferredaudioformat (default mp3), ignore user if bot
  // Load existing user settings if they exist
  const existingUsersPath = "./database/usersetting.json";
  let existingUsers = {};
  if (fs.existsSync(existingUsersPath)) {
    try {
      existingUsers = JSON.parse(fs.readFileSync(existingUsersPath, "utf-8"));
    } catch (error) {
      console.error("Error reading existing user settings:", error);
    }
  }

  const allUsers = {};
  client.guilds.cache.forEach((guild) => {
    guild.members.cache.forEach((member) => {
      if (!member.user.bot && !allUsers[member.user.id]) {
        // Use existing settings if user already exists, otherwise use defaults
        allUsers[member.user.id] = existingUsers[member.user.id] || {
          username: member.user.username,
          tiktokwatermark: false,
          audioformat: "mp3",
        };

        // Set tiktokdesc based on tiktokwatermark value
        allUsers[member.user.id].tiktokwatermarkdesc = allUsers[member.user.id]
          .tiktokwatermark
          ? "watermark at the end of the video will be shown"
          : "watermark at the end of the video will be hidden";

        // Set audioformatdesc based on preferredaudioformat value
        allUsers[member.user.id].audioformatdesc =
          `preferred audio format is ${allUsers[member.user.id].audioformat}`;

        // Update username in case it changed
        if (existingUsers[member.user.id]) {
          allUsers[member.user.id].username = member.user.username;
        }
      }
    });
  });
  fs.writeFileSync(
    "./database/usersetting.json",
    JSON.stringify(allUsers, null, 2),
  );

  console.log(
    `wake yo ass up bc it's time to go beast mode, logged in as ${client.user.username}`,
  );
});

// Discord client error handlers
client.on("error", (error) => {
  reportError(error, { context: "Discord Client Error" });
});

client.on("warn", (warning) => {
  console.warn("Discord Warning:", warning);
});

client.on("shardError", (error) => {
  reportError(error, { context: "Discord Shard Error" });
});

client.login(process.env.TOKEN).catch((error) => {
  reportError(error, { context: "Bot Login Failed" });
  process.exit(1);
});
