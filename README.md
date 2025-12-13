# ChocBot - Discord Media Bot

A powerful Discord bot for downloading media from various platforms, with advanced processing capabilities.

## Features

- Download videos/audio from YouTube (including playlists), Twitter, Instagram, TikTok, SoundCloud, and Spotify
- Audio transcription using OpenAI Whisper
- Text translation
- File format conversion
- Custom image/video filters (Rio De Janeiro filter)
- GTA iFruit call screen generator
- Freaky font text transformation
- Lyrics finder
- **Supports both slash commands and legacy text commands**
- All slash command responses are ephemeral (only visible to you)

## Deployment on Railway

### Prerequisites

1. A Discord Bot Token
2. Discord Application Client ID
3. Spotify API credentials (optional, for Spotify downloads)
4. DeepInfra API token (optional, for audio transcription)
5. Genius API token (optional, for lyrics)

### Setup Instructions

1. **Fork/Clone this repository**

2. **Set up environment variables in Railway:**

   Required:
   - `TOKEN` - Your Discord bot token
   - `CLIENT_ID` - Your Discord application client ID
   - `PREFIX` - Command prefix for text commands (default: !)
   - `FILE_DELETE_TIMEOUT` - Minutes before downloaded files are deleted (default: 30)
   
   Optional:
   - `ERROR_WEBHOOK_URL` - Discord webhook URL for error reporting
   - `DEEPINFRA_TOKEN` - For audio transcription feature
   - `UPLOADURL` - Base URL for file uploads
   - `COBALT_API` - Cobalt API endpoint (if using)
   - `GENIUS_TOKEN` - For lyrics feature
   - `SPOTIFY_CLIENT_ID` - For Spotify downloads
   - `SPOTIFY_CLIENT_SECRET` - For Spotify downloads
   - `SOUNDCLOUD_CLIENT_ID` - For SoundCloud downloads

3. **Deploy to Railway:**

   The `railway.toml` file is pre-configured with:
   - Nixpacks builder with FFmpeg and Python3
   - Automatic restart on failure (max 3 retries)
   - Start command: `npm start`

4. **Set up Error Webhook (Optional but Recommended):**

   - Create a webhook in your Discord server's error logging channel
   - Copy the webhook URL
   - Set it as the `ERROR_WEBHOOK_URL` environment variable
   - The bot will automatically report all errors to this channel

### Error Reporting

The bot includes comprehensive error reporting that sends detailed information to your webhook:
- Error type and message
- Stack trace
- Command that caused the error
- User and guild information
- Timestamp

Errors are reported for:
- Slash command execution errors
- Discord client errors
- Uncaught exceptions
- Unhandled promise rejections
- Bot login failures

## Commands

The bot supports both **slash commands** (e.g., `/download`) and **legacy text commands** (e.g., `!download`).

- Slash commands are ephemeral (only visible to you)
- Text commands work in chat and are visible to everyone

### Slash Commands:

- `/help [command]` - Get help with bot commands
- `/download <url> [format]` - Download media from supported platforms
- `/translate <text> [to] [from]` - Translate text between languages
- `/convert <file> [format]` - Convert files between formats
- `/freaky <text>` - Transform text into freaky font
- `/lyrics <url>` - Find lyrics for a song
- `/riodejaneiro <file> [intensity] [customtext] [notext]` - Apply Rio De Janeiro filter
- `/audioanalyze [url] [file]` - Transcribe audio to text
- `/ifruit [user] [customname]` - Create GTA iFruit call screen
- `/settings` - Manage your bot settings

### Legacy Text Commands:

Text commands use the prefix defined in your `.env` file (default: `!`). Each command has multiple aliases for convenience:

- `!download`, `!down`, `!dl` - Download media
  - Example: `!download https://www.youtube.com/watch?v=...`
  - Modifiers: `!download:aud` (audio only)
  
- `!translate`, `!trans`, `!tl` - Translate text
  - Example: `!translate "Hello World" es`
  
- `!convert`, `!conv` - Convert files
  - Example: Upload a file and type `!convert:mp3`
  
- `!freaky`, `!freak` - Freaky font
  - Example: `!freaky Hello World`
  
- `!lyrics`, `!lyric` - Find lyrics
  - Example: `!lyrics https://open.spotify.com/track/...`
  
- `!rj`, `!rio`, `!riodejaneiro` - Rio filter
  - Example: Upload image/video and type `!rj:5` (intensity 5)
  - Modifiers: `:intensity`, `:customtext`, `:notext`
  
- `!audioanalyze`, `!audio`, `!transcribe` - Transcribe audio
  - Example: Upload audio/video or `!audioanalyze https://...`
  
- `!ifruit`, `!iFruit` - GTA call screen
  - Example: `!ifruit @user` or `!ifruit Custom Name`
  
- `!settings`, `!setting`, `!config` - Bot settings
  - Example: `!settings`

### Getting Help:

For any command, add `help` to see detailed usage:
- Slash: `/help command:download`
- Text: `!download help`

## Command Examples:

### Download Examples:
```
/download https://www.youtube.com/watch?v=dQw4w9WgXcQ format:Audio
!download:aud https://www.youtube.com/watch?v=dQw4w9WgXcQ
/download https://www.youtube.com/playlist?list=... (downloads entire playlist)
```

### Translate Examples:
```
/translate "Hello world" to:es
!translate "Bonjour le monde" en
```

### Convert Examples:
```
/convert file:(upload) format:png
# Upload a file and type:
!convert:mp3
```

## Progress Tracking

The bot includes real-time progress tracking for downloads:
- **YouTube videos:** Shows percentage progress, merging status, and extraction status
- **YouTube playlists:** Shows video-by-video progress (e.g., "Downloading video 3/10")
- **SoundCloud playlists:** Shows track-by-track progress
- **Spotify:** Shows search and download progress
- Other platforms: Simple status updates

All progress messages are ephemeral and automatically deleted after completion.

## YouTube Playlist Support

Download entire YouTube playlists with a single command:
- Automatically downloads all videos in the playlist
- Supports both video and audio format
- Adds proper metadata (track numbers, album info)
- Packages everything into a convenient ZIP file
- Shows progress for each video

Example: `/download https://www.youtube.com/playlist?list=... format:Audio`

## System Requirements

- Node.js 18+
- FFmpeg (included in Railway deployment)
- Python 3 (included in Railway deployment)

## Development

```bash
# Install dependencies
npm install

# Create .env file from example
cp .env.example .env

# Start the bot
npm start
```

## Migration Notes

This bot now supports **both slash commands and legacy text commands**:

### Using Slash Commands (Modern):
- All commands use `/` prefix (e.g., `/download`)
- All responses are ephemeral (only you can see them)
- Use `/help` to see all available commands
- Use `/help command:<name>` for detailed help

### Using Text Commands (Legacy):
- All commands use the configured prefix (default: `!`)
- Multiple aliases available for each command
- Responses are visible to everyone in chat
- Add `help` after any command to see its usage

Both command types work simultaneously, so users can choose their preferred method.

## License

ISC

## Support

For issues or questions, please create an issue in the repository or contact the bot owner.
