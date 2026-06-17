const { REST, Routes } = require("discord.js");
require("dotenv").config();
const {
  loadCommandRegistry,
  getApplicationCommands,
} = require("./backbone/commandRegistry");

const commandEntries = loadCommandRegistry();
const commands = getApplicationCommands(commandEntries);
const rest = new REST().setToken(process.env.TOKEN);

(async () => {
  try {
    console.log(
      `Started refreshing ${commands.length} application (/) commands.`,
    );

    const data = await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands },
    );

    console.log(
      `Successfully reloaded ${data.length} application (/) commands.`,
    );
    console.log(
      `Registered commands: ${commands.map((command) => command.name).join(", ")}`,
    );
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
})();
