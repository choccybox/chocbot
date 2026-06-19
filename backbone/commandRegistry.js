const fs = require("fs");
const path = require("path");
const { SlashCommandBuilder } = require("discord.js");

const commandsDirectory = path.join(__dirname, "..", "commands");

function findCommandFiles(directory = commandsDirectory) {
  if (!fs.existsSync(directory)) return [];

  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return findCommandFiles(entryPath);
      if (entry.isFile() && entry.name.endsWith(".js")) return [entryPath];
      return [];
    })
    .sort();
}

function normalizeCommandName(name) {
  return name?.toLowerCase().trim();
}

function getSlashCommandBuilder(commandModule) {
  const slashCommand = commandModule.slashCommand || commandModule.data;
  if (typeof slashCommand === "function")
    return slashCommand(SlashCommandBuilder);
  return slashCommand;
}

function getSlashCommandJson(commandModule) {
  const slashCommand = getSlashCommandBuilder(commandModule);
  if (!slashCommand) return null;
  if (typeof slashCommand.toJSON === "function") return slashCommand.toJSON();
  return slashCommand;
}

function loadCommandRegistry() {
  return findCommandFiles().map((filePath) => {
    const relativePath = path
      .relative(commandsDirectory, filePath)
      .replace(/\\/g, "/");
    const commandModule = require(filePath);
    const slashCommandJson = getSlashCommandJson(commandModule);
    if (!slashCommandJson) {
      throw new Error(
        `Command file ${relativePath} must export a slashCommand builder or data object.`,
      );
    }
    const name = normalizeCommandName(
      commandModule.name ||
        slashCommandJson.name ||
        path.basename(filePath, ".js"),
    );
    const aliases = [
      ...new Set(
        [name, ...(commandModule.altnames || commandModule.aliases || [])]
          .filter(Boolean)
          .map(normalizeCommandName),
      ),
    ];

    return {
      name,
      aliases,
      description:
        commandModule.quickdesc ||
        commandModule.description ||
        slashCommandJson?.description ||
        "No description provided.",
      file: relativePath,
      filePath,
      module: commandModule,
      slashCommandJson,
      help: commandModule.help || null,
    };
  });
}

function getHelpSlashCommand() {
  return new SlashCommandBuilder()
    .setName("help")
    .setDescription("Get help with bot commands")
    .addStringOption((option) =>
      option
        .setName("command")
        .setDescription("Specific command to get help with")
        .setAutocomplete(true)
        .setRequired(false),
    )
    .toJSON();
}

function getApplicationCommands(commandEntries = loadCommandRegistry()) {
  return [
    ...commandEntries
      .filter((entry) => entry.slashCommandJson)
      .map((entry) => entry.slashCommandJson),
    getHelpSlashCommand(),
  ];
}

function buildTextCommandMap(commandEntries = loadCommandRegistry()) {
  const commands = {};
  commandEntries.forEach((entry) => {
    entry.aliases.forEach((alias) => {
      commands[alias] = { file: entry.file };
    });
  });
  return commands;
}

function buildCommandDescriptions(commandEntries = loadCommandRegistry()) {
  const descriptions = {};
  commandEntries.forEach((entry) => {
    descriptions[entry.name] = {
      quickdescript: entry.description,
      altnames: entry.aliases,
    };
  });
  return descriptions;
}

function buildCommandHelp(commandEntries = loadCommandRegistry()) {
  const help = {};
  commandEntries.forEach((entry) => {
    help[entry.name] = entry.help || {
      description: entry.description,
      usage: `/${entry.name}`,
      examples: [`/${entry.name}`],
      options: "None",
    };
  });
  return help;
}

function findCommandEntry(commandEntries, commandName) {
  const normalizedName = normalizeCommandName(commandName);
  return commandEntries.find((entry) => entry.name === normalizedName);
}

function getCommandAutocompleteChoices(commandEntries, input) {
  const search = (input || "").toLowerCase().trim();
  return commandEntries
    .filter((entry) => entry.name.includes(search))
    .slice(0, 25)
    .map((entry) => ({
      name: entry.name,
      value: entry.name,
    }));
}

module.exports = {
  findCommandFiles,
  loadCommandRegistry,
  getApplicationCommands,
  buildTextCommandMap,
  buildCommandDescriptions,
  buildCommandHelp,
  findCommandEntry,
  getCommandAutocompleteChoices,
};
