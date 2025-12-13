const { Client, GatewayIntentBits, Collection, REST, Routes, SlashCommandBuilder, WebhookClient, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const index = express();const PORT = process.env.PORT || 3000;
const mimeType = require('mime-types');

index.listen(PORT, () => {});
// Serve static files from the "public" directory
index.use('/temp', express.static(path.join(__dirname, 'temp')));

// Initialize error webhook if URL is provided
let errorWebhook = null;
if (process.env.ERROR_WEBHOOK_URL) {
  try {
    errorWebhook = new WebhookClient({ url: process.env.ERROR_WEBHOOK_URL });
    console.log('Error webhook initialized');
  } catch (err) {
    console.error('Failed to initialize error webhook:', err);
  }
}

// Global error reporter function
async function reportError(error, context = {}) {
  console.error('Error occurred:', error);
  
  if (!errorWebhook) return;
  
  try {
    const embed = new EmbedBuilder()
      .setTitle('🚨 Bot Error Detected')
      .setColor(0xFF0000)
      .setTimestamp()
      .addFields(
        { name: 'Error Type', value: error.name || 'Unknown', inline: true },
        { name: 'Error Message', value: (error.message || 'No message').slice(0, 1024), inline: false }
      );
    
    if (error.stack) {
      embed.addFields({ name: 'Stack Trace', value: `\`\`\`${error.stack.slice(0, 1000)}\`\`\``, inline: false });
    }
    
    if (context.command) {
      embed.addFields({ name: 'Command', value: context.command, inline: true });
    }
    
    if (context.user) {
      embed.addFields({ name: 'User', value: `${context.user.tag} (${context.user.id})`, inline: true });
    }
    
    if (context.guild) {
      embed.addFields({ name: 'Guild', value: `${context.guild.name} (${context.guild.id})`, inline: true });
    }
    
    await errorWebhook.send({ embeds: [embed] });
  } catch (webhookErr) {
    console.error('Failed to send error webhook:', webhookErr);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  reportError(error, { context: 'Uncaught Exception' });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (error) => {
  reportError(error, { context: 'Unhandled Rejection' });
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
  fetchAllMembers: true
});

const commandsList = require('./database/commands.json');

// Register slash commands on startup
async function registerSlashCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName('download')
      .setDescription('Download video/audio from social/music platforms')
      .addStringOption(option =>
        option.setName('url')
          .setDescription('URL to download from')
          .setRequired(true))
      .addStringOption(option =>
        option.setName('format')
          .setDescription('Download format')
          .addChoices(
            { name: 'Video', value: 'video' },
            { name: 'Audio', value: 'audio' }
          )),

    new SlashCommandBuilder()
      .setName('translate')
      .setDescription('Translates text from autodetected language to English or specified language')
      .addStringOption(option =>
        option.setName('text')
          .setDescription('Text to translate')
          .setRequired(true))
      .addStringOption(option =>
        option.setName('to')
          .setDescription('Target language (e.g., en, es, fr, ja)')
          .setRequired(false))
      .addStringOption(option =>
        option.setName('from')
          .setDescription('Source language (e.g., en, es, fr, ja)')
          .setRequired(false)),

    new SlashCommandBuilder()
      .setName('convert')
      .setDescription('Converts a file to different format')
      .addAttachmentOption(option =>
        option.setName('file')
          .setDescription('File to convert')
          .setRequired(true))
      .addStringOption(option =>
        option.setName('format')
          .setDescription('Target format (png, jpg, gif, mp4, etc.)')
          .setRequired(false)),

    new SlashCommandBuilder()
      .setName('freaky')
      .setDescription('Makes your text 𝓯𝓻𝓮𝓪𝓴𝔂')
      .addStringOption(option =>
        option.setName('text')
          .setDescription('Text to transform')
          .setRequired(true)),

    new SlashCommandBuilder()
      .setName('lyrics')
      .setDescription('Find lyrics for a song from music platforms')
      .addStringOption(option =>
        option.setName('url')
          .setDescription('URL of the song (YouTube, Spotify, SoundCloud)')
          .setRequired(true)),

    new SlashCommandBuilder()
      .setName('riodejaneiro')
      .setDescription('Adds a Rio De Janeiro Instagram filter over image/video')
      .addAttachmentOption(option =>
        option.setName('file')
          .setDescription('Image or video to process')
          .setRequired(true))
      .addIntegerOption(option =>
        option.setName('intensity')
          .setDescription('Filter intensity (2-8)')
          .setMinValue(2)
          .setMaxValue(8))
      .addStringOption(option =>
        option.setName('customtext')
          .setDescription('Custom text to display')
          .setRequired(false))
      .addBooleanOption(option =>
        option.setName('notext')
          .setDescription('Remove text from image')
          .setRequired(false)),

    new SlashCommandBuilder()
      .setName('audioanalyze')
      .setDescription('Transcribe audio/video/links to text using OpenAI Whisper')
      .addStringOption(option =>
        option.setName('url')
          .setDescription('URL of audio/video to transcribe')
          .setRequired(false))
      .addAttachmentOption(option =>
        option.setName('file')
          .setDescription('Audio/video file to transcribe')
          .setRequired(false)),

    new SlashCommandBuilder()
      .setName('ifruit')
      .setDescription('Create a GTA iFruit call screen with profile pictures')
      .addUserOption(option =>
        option.setName('user')
          .setDescription('User for profile picture')
          .setRequired(false))
      .addStringOption(option =>
        option.setName('customname')
          .setDescription('Custom name to display')
          .setRequired(false)),
      
    new SlashCommandBuilder()
      .setName('help')
      .setDescription('Get help with bot commands')
      .addStringOption(option =>
        option.setName('command')
          .setDescription('Specific command to get help with')
          .setRequired(false)
          .addChoices(
            { name: 'download', value: 'download' },
            { name: 'translate', value: 'translate' },
            { name: 'convert', value: 'convert' },
            { name: 'freaky', value: 'freaky' },
            { name: 'lyrics', value: 'lyrics' },
            { name: 'riodejaneiro', value: 'riodejaneiro' },
            { name: 'audioanalyze', value: 'audioanalyze' },
            { name: 'ifruit', value: 'ifruit' }
          ))
  ].map(command => command.toJSON());

  const rest = new REST().setToken(process.env.TOKEN);

  try {
    console.log(`Started refreshing ${commands.length} application (/) commands.`);
    const data = await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands },
    );
    console.log(`Successfully reloaded ${data.length} application (/) commands.`);
  } catch (error) {
    console.error('Error registering slash commands:', error);
    await reportError(error, { context: 'Slash Command Registration' });
  }
}

// Command name mapping to file names
const commandFileMap = {
  'download': 'downloader.js',
  'translate': 'translate.js',
  'convert': 'convert.js',
  'freaky': 'freakyfont.js',
  'lyrics': 'lyricfinder.js',
  'riodejaneiro': 'riodejaneiro.js',
  'audioanalyze': 'audioanalyze.js',
  'ifruit': 'ifruitcall.js'
};

// Command help information
const commandHelp = {
  'download': {
    description: 'Download video/audio from social/music platforms (YouTube, Twitter, Instagram, TikTok, SoundCloud, Spotify)',
    usage: '/download <url> [format]',
    examples: [
      '/download https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      '/download https://www.youtube.com/watch?v=dQw4w9WgXcQ format:Audio',
      '/download https://www.youtube.com/playlist?list=... (downloads entire playlist)'
    ],
    options: '**format:** Video or Audio - Choose to download video or extract audio only'
  },
  'translate': {
    description: 'Translates text from autodetected language to English or from one specified language to another',
    usage: '/translate <text> [to] [from]',
    examples: [
      '/translate "Hello world"',
      '/translate "Bonjour" to:en',
      '/translate "Hello" from:en to:es'
    ],
    options: '**to:** Target language (e.g., en, es, fr, ja)\n**from:** Source language (optional, auto-detected if not specified)'
  },
  'convert': {
    description: 'Converts a file to different format based on uploaded file type or specified format',
    usage: '/convert <file> [format]',
    examples: [
      '/convert file:(upload image) format:png',
      '/convert file:(upload video) format:gif',
      '/convert file:(upload audio) format:mp3'
    ],
    options: '**format:** Target format - Supports image (png, jpg, gif, webp), video (mp4, avi, mov, mkv, webm), and audio (mp3, flac, wav, ogg) formats'
  },
  'freaky': {
    description: 'Makes your text 𝓯𝓻𝓮𝓪𝓴𝔂',
    usage: '/freaky <text>',
    examples: ['/freaky "Hello World"'],
    options: 'None - Just provide text to transform'
  },
  'lyrics': {
    description: 'Find lyrics for a song from music platforms (YouTube, Spotify, SoundCloud)',
    usage: '/lyrics <url>',
    examples: [
      '/lyrics https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      '/lyrics https://open.spotify.com/track/...'
    ],
    options: 'None - Just provide a song URL'
  },
  'riodejaneiro': {
    description: 'Adds a Rio De Janeiro Instagram filter over image/video',
    usage: '/riodejaneiro <file> [intensity] [customtext] [notext]',
    examples: [
      '/riodejaneiro file:(upload image)',
      '/riodejaneiro file:(upload) intensity:5',
      '/riodejaneiro file:(upload) customtext:"never gonna"',
      '/riodejaneiro file:(upload) notext:true'
    ],
    options: '**intensity:** Filter intensity (2-8)\n**customtext:** Custom text to display instead of "Rio De Janeiro"\n**notext:** Remove text from the image'
  },
  'audioanalyze': {
    description: 'Transcribe audio/video/links to text using OpenAI Whisper model',
    usage: '/audioanalyze [url] [file]',
    examples: [
      '/audioanalyze url:https://www.youtube.com/watch?v=...',
      '/audioanalyze file:(upload audio/video)'
    ],
    options: 'Provide either a URL or upload a file - supports audio and video files'
  },
  'ifruit': {
    description: 'Create a GTA iFruit call screen with profile pictures',
    usage: '/ifruit [user] [customname]',
    examples: [
      '/ifruit (uses your pfp and display name)',
      '/ifruit user:@someone',
      '/ifruit customname:"John Doe"',
      '/ifruit user:@someone customname:"Custom Name"'
    ],
    options: '**user:** User to use profile picture from\n**customname:** Custom name to display on the call screen'
  }
};

// Handle interactions (slash commands and buttons)
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const commandName = interaction.commandName;
  
  // Handle help command separately
  if (commandName === 'help') {
    const specificCommand = interaction.options.getString('command');
    
    if (!specificCommand) {
      // Show all commands
      const allCommandsHelp = Object.keys(commandHelp).map(cmd => {
        return `**/${cmd}** - ${commandHelp[cmd].description}`;
      }).join('\n\n');
      
      return interaction.reply({
        embeds: [{
          title: '📚 Bot Commands Help',
          description: allCommandsHelp + '\n\n*Use `/help command:<command_name>` for detailed help on a specific command*',
          color: 0x5865F2,
          footer: { text: 'All commands are only visible to you' }
        }],
        ephemeral: true
      });
    } else {
      // Show specific command help
      const help = commandHelp[specificCommand];
      if (!help) {
        return interaction.reply({
          content: `Command \`${specificCommand}\` not found.`,
          ephemeral: true
        });
      }
      
      return interaction.reply({
        embeds: [{
          title: `📖 Help: /${specificCommand}`,
          description: help.description,
          fields: [
            { name: 'Usage', value: `\`${help.usage}\``, inline: false },
            { name: 'Examples', value: help.examples.map(ex => `\`${ex}\``).join('\n'), inline: false },
            { name: 'Options', value: help.options, inline: false }
          ],
          color: 0x5865F2
        }],
        ephemeral: true
      });
    }
  }
  
  const commandFile = commandFileMap[commandName];

  if (!commandFile) {
    return interaction.reply({ content: 'Command not found!', ephemeral: true });
  }

  try {
    const command = require(path.join(__dirname, 'commands', commandFile));
    console.log(`Executing slash command: ${commandName}`);

    // Defer reply immediately to prevent timeout with ephemeral flag
    await interaction.deferReply({ flags: 64 }); // 64 is the flag for ephemeral

    // Build content string and attachments based on command
    let contentParts = [];
    const mockAttachments = new Map();

    if (commandName === 'download') {
      const url = interaction.options.getString('url');
      const format = interaction.options.getString('format');
      contentParts.push(url);
      if (format === 'audio') {
        contentParts = [`download:aud ${url}`];
      } else {
        contentParts = [`download ${url}`];
      }
    } else if (commandName === 'translate') {
      const text = interaction.options.getString('text');
      const to = interaction.options.getString('to');
      const from = interaction.options.getString('from');
      contentParts.push(text);
      if (from) contentParts.push(from);
      if (to) contentParts.push(to);
    } else if (commandName === 'convert') {
      const file = interaction.options.getAttachment('file');
      const format = interaction.options.getString('format');
      mockAttachments.set(file.id, file);
      if (format) contentParts.push(`:${format}`);
    } else if (commandName === 'freaky') {
      const text = interaction.options.getString('text');
      contentParts.push(text);
    } else if (commandName === 'lyrics') {
      const url = interaction.options.getString('url');
      contentParts.push(url);
    } else if (commandName === 'riodejaneiro') {
      const file = interaction.options.getAttachment('file');
      mockAttachments.set(file.id, file);
      const intensity = interaction.options.getInteger('intensity');
      const customtext = interaction.options.getString('customtext');
      const notext = interaction.options.getBoolean('notext');
      
      let modifiers = [];
      if (intensity) modifiers.push(intensity.toString());
      if (customtext) modifiers.push(customtext);
      if (notext) modifiers.push('notext');
      if (modifiers.length > 0) contentParts.push(`:${modifiers.join(':')}`);
    } else if (commandName === 'audioanalyze') {
      const url = interaction.options.getString('url');
      const file = interaction.options.getAttachment('file');
      if (url) contentParts.push(url);
      if (file) mockAttachments.set(file.id, file);
    } else if (commandName === 'ifruit') {
      const user = interaction.options.getUser('user');
      const customname = interaction.options.getString('customname');
      if (user) contentParts.push(`<@${user.id}>`);
      if (customname) contentParts.push(customname);
    }

    // Create mock message object that properly wraps the interaction
    let hasReplied = false;
    
    const mockMessage = {
      content: `${commandName} ${contentParts.join(' ')}`.trim(),
      author: interaction.user,
      channel: interaction.channel,
      guild: interaction.guild,
      member: interaction.member,
      attachments: mockAttachments,
      mentions: {
        users: interaction.options.getUser('user') ? 
          new Map([[interaction.options.getUser('user').id, interaction.options.getUser('user')]]) : 
          new Map(),
        has: (user) => interaction.options.getUser('user')?.id === user.id
      },
      // Pass through the interaction properties
      deferred: interaction.deferred,
      replied: interaction.replied,
      editReply: async (options) => {
        try {
          hasReplied = true;
          return await interaction.editReply(options);
        } catch (error) {
          console.error('Error editing reply:', error);
          throw error;
        }
      },
      react: async (emoji) => {
        // Slash commands can't react, silently ignore
        return Promise.resolve();
      },
      reply: async (options) => {
        try {
          hasReplied = true;
          return await interaction.followUp(options);
        } catch (error) {
          console.error('Error sending follow-up:', error);
          throw error;
        }
      }
    };

    const result = await command.run(mockMessage, client, mockAttachments.size > 0 ? mockAttachments : null);

    if (result && typeof result === 'string') {
      await interaction.followUp({ content: result }).catch(console.error);
    } else if (!hasReplied && !interaction.replied) {
      // If command didn't reply, edit the deferred reply
      await interaction.editReply({ content: 'Command executed successfully!' }).catch(console.error);
    }
  } catch (error) {
    console.error(`Error executing slash command ${commandName}:`, error);
    
    // Report error to webhook
    await reportError(error, {
      command: commandName,
      user: interaction.user,
      guild: interaction.guild,
      context: 'Slash Command Execution'
    });
    
    try {
      if (interaction.deferred && !interaction.replied) {
        await interaction.editReply({ content: `An error occurred while processing the command.` });
      } else if (!interaction.replied) {
        await interaction.reply({ content: `An error occurred while processing the command.`, ephemeral: true });
      }
    } catch (replyError) {
      console.error('Failed to send error message:', replyError);
    }
  }
});

// Read all .js files in commands folder, log them, and get their first line of code altnames and write those as available commands into a .json file
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
const commands = {};
const quickdesc = {};

commandFiles.forEach(file => {
  const filePath = path.join(__dirname, 'commands', file);
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const firstLine = fileContent.split('\n')[0];
  const secondLine = fileContent.split('\n')[1];
  const altnameMatch = firstLine.match(/const altnames = \[(.*)\]/);

  if (altnameMatch) {
    const altnames = altnameMatch[1].split(',').map(name => name.trim().replace(/'/g, '')) || [];
    
    altnames.forEach(altname => {
      commands[altname] = {
        file: file,
      };
    });

    const quickdescriptMatch = secondLine.match(/const quickdesc = '(.*)'/);
    if (quickdescriptMatch) {
      const quickdescript = quickdescriptMatch[1];
      quickdesc[file.split('.')[0].toLowerCase()] = {
      quickdescript: quickdescript,
      altnames: altnames,
      };
    }
  }
});

index.get('/temp/:filename', (req, res) => {
  const filename = req.params.filename;
  const filepath = path.join(__dirname, 'temp', filename);
  
  // Check if file exists
  fs.access(filepath, fs.constants.F_OK, (err) => {
    if (err) {
      return res.status(404).send('File not found');
    }
    
    // Determine MIME type based on file extension
    const mime = mimeType.lookup(filepath) || 'application/octet-stream';
    
    // Set headers to force download
    res.set({
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Type': mime
    });
    
    // Create and pipe a read stream with error handling
    const fileStream = fs.createReadStream(filepath);
    fileStream.on('error', (error) => {
      console.error('Error reading file:', error);
      res.status(500).send('Error downloading file');
    });
    
    fileStream.pipe(res);
  });
});

// Set up a route for the root URL
index.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'images', 'pukeko.jpg'));
});

// Write the commands to a .json file
fs.writeFileSync('./database/commands.json', JSON.stringify(commands, null, 2));
fs.writeFileSync('./database/commandsdesc.json', JSON.stringify(quickdesc, null, 2));

// Handle text commands (legacy support)
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(process.env.PREFIX || '!')) return;

  const args = message.content.slice((process.env.PREFIX || '!').length).trim().split(/ +/);
  const command = args.shift().toLowerCase();
  
  // Check if command exists in commands.json
  const commandData = commands[command];
  if (!commandData) return;
  
  try {
    const commandFile = require(path.join(__dirname, 'commands', commandData.file));
    console.log(`Executing text command: ${command}`);
    
    await commandFile.run(message, client);
  } catch (error) {
    console.error(`Error executing text command ${command}:`, error);
    await reportError(error, {
      command: command,
      user: message.author,
      guild: message.guild,
      context: 'Text Command Execution'
    });
    
    try {
      await message.reply('An error occurred while processing the command.');
    } catch (replyError) {
      console.error('Failed to send error message:', replyError);
    }
  }
});

client.once('clientReady', async () => {
  // Register slash commands
  await registerSlashCommands();
  
  const tempDir = path.join(__dirname, 'temp');

  // Create temp directory if it doesn't exist
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
    console.log('Created temp directory');
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
    setInterval(() => {
      // Force garbage collection if available
      if (global.gc) {
      global.gc();
      console.log('Forced garbage collection');
      }
      
      // Log current memory usage
      const memUsage = process.memoryUsage();
      console.log('Memory usage after cleanup:', {
      rss: Math.round(memUsage.rss / 1024 / 1024) + ' MB',
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + ' MB',
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + ' MB'
      });
    }, 6 * 60 * 60 * 1000); // 6 hours in milliseconds
  }

  // get all users in every guild and save their ids and usernames to a .json file, give each user 2 variables: tiktokwatermark (default true) and preferredaudioformat (default mp3), ignore user if bot
  // Load existing user settings if they exist
  const existingUsersPath = './database/usersetting.json';
  let existingUsers = {};
  if (fs.existsSync(existingUsersPath)) {
    try {
      existingUsers = JSON.parse(fs.readFileSync(existingUsersPath, 'utf-8'));
    } catch (error) {
      console.error('Error reading existing user settings:', error);
    }
  }

  const allUsers = {};
  client.guilds.cache.forEach(guild => {
    guild.members.cache.forEach(member => {
      if (!member.user.bot && !allUsers[member.user.id]) {
        // Use existing settings if user already exists, otherwise use defaults
        allUsers[member.user.id] = existingUsers[member.user.id] || {
          username: member.user.username,
          tiktokwatermark: false,
          audioformat: 'mp3'
        };
        
        // Set tiktokdesc based on tiktokwatermark value
        allUsers[member.user.id].tiktokwatermarkdesc = allUsers[member.user.id].tiktokwatermark 
          ? "watermark at the end of the video will be shown" 
          : "watermark at the end of the video will be hidden";
        
        // Set audioformatdesc based on preferredaudioformat value
        allUsers[member.user.id].audioformatdesc = `preferred audio format is ${allUsers[member.user.id].audioformat}`;
        
        // Update username in case it changed
        if (existingUsers[member.user.id]) {
          allUsers[member.user.id].username = member.user.username;
        }
      }
    });
  });
  fs.writeFileSync('./database/usersetting.json', JSON.stringify(allUsers, null, 2));

  console.log(`wake yo ass up bc it's time to go beast mode`);
});

// Discord client error handlers
client.on('error', (error) => {
  reportError(error, { context: 'Discord Client Error' });
});

client.on('warn', (warning) => {
  console.warn('Discord Warning:', warning);
});

client.on('shardError', (error) => {
  reportError(error, { context: 'Discord Shard Error' });
});

client.login(process.env.TOKEN).catch((error) => {
  reportError(error, { context: 'Bot Login Failed' });
  process.exit(1);
});