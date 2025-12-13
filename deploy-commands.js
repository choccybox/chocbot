const { REST, Routes, SlashCommandBuilder } = require('discord.js');
require('dotenv').config();

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
].map(command => command.toJSON());

const rest = new REST().setToken(process.env.TOKEN);

(async () => {
  try {
    console.log(`Started refreshing ${commands.length} application (/) commands.`);

    const data = await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands },
    );

    console.log(`Successfully reloaded ${data.length} application (/) commands.`);
  } catch (error) {
    console.error(error);
  }
})();
