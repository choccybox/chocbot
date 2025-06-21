const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const index = express();const PORT = process.env.PORT || 3000;
const mimeType = require('mime-types');

index.listen(PORT, () => {});
// Serve static files from the "public" directory
index.use('/temp', express.static(path.join(__dirname, 'temp')));

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

client.on('messageCreate', async (message) => {
  const prefix = process.env.PREFIX;
  const botMention = `<@${client.user.id}>`;

  if (message.content.startsWith(prefix) || message.content.startsWith(botMention) || message.mentions.has(client.user)) {
    const contentWithoutPrefix = message.content.startsWith(prefix)
      ? message.content.slice(prefix.length).trim()
      : message.content.startsWith(botMention)
      ? message.content.slice(botMention.length).trim()
      : message.content;

    const messageWords = contentWithoutPrefix.split(/[\s,]+/);
    const commandWords = messageWords.filter(word => commandsList[word.split(':')[0]]);
    const uniqueCommands = [...new Set(commandWords.map(word => word.split(':')[0]))];
    let currentAttachments = message.attachments.size > 0 ? message.attachments : null;

    // Check for attachments in the current message or in a replied message
    if (!currentAttachments && message.reference) {
      try {
      const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
      currentAttachments = repliedMessage.attachments.size > 0 ? repliedMessage.attachments : null;
      console.log(`Found ${repliedMessage.attachments.size} attachments in replied message`);
      } catch (error) {
      console.error("Failed to fetch replied message:", error);
      }
    } else if (!currentAttachments && contentWithoutPrefix.includes('pukeko')) {
      message.reply({ files: [{ attachment: path.join(__dirname, 'images', 'pukeko.jpg') }] });
      return;
    } else if (!currentAttachments && contentWithoutPrefix === 'help') {
      // get the file commandsdesc.json and format it correctly into this order: command, quickdesc, altnames
      const commandsDesc = require('./database/commandsdesc.json');
      const formattedCommands = Object.keys(commandsDesc).map(command => {
      return `**${command}:** ${commandsDesc[command].quickdescript}\n**aliases:** \`${commandsDesc[command].altnames.join(', ')}\``;
      });
      const formattedCommandsString = formattedCommands.join('\n\n');
      message.reply({ content: `${formattedCommandsString}` });
    } else if (!currentAttachments && contentWithoutPrefix === '') {
      message.reply({ content: 'Please provide an audio or video file to process.' });
      return;
    }

    for (const commandName of uniqueCommands) {
      console.log(`Command name: ${commandName}`);
      const commandInfo = commandsList[commandName];

      if (!commandInfo) {
        console.log(`Command ${commandName} not found in commands list.`);
        continue;
      }

      try {
        const commandFile = require(path.join(__dirname, 'commands', commandInfo.file));
        console.log(`Executing command: ${commandName}`);

        const result = await commandFile.run(message, client, currentAttachments);

        if (result && typeof result === 'string') {
          await message.reply({ content: result }).catch(console.error);
        }
        
      } catch (error) {
        console.error(`Error executing command ${commandName}:`, error);
        return message.reply({ content: `An error occurred while processing the command ${commandName}.` });
      }
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
  res.sendFile(path.join(__dirname, 'website', 'index.html'));
});

// Write the commands to a .json file
fs.writeFileSync('./database/commands.json', JSON.stringify(commands, null, 2));
fs.writeFileSync('./database/commandsdesc.json', JSON.stringify(quickdesc, null, 2));

client.once('ready', async () => {
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

  console.log(`wake yo ass up bc it's time to go beast mode`);
});

client.login(process.env.TOKEN);