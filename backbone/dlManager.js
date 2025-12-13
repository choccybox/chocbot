const axios = require('axios');
const fs = require('fs');
const { twitter, igdl, ttdl } = require('btch-downloader');
const ffmpeg = require('fluent-ffmpeg');
const NodeID3 = require('node-id3');
const path = require('path');
const sanitize = require('sanitize-filename');
const SpotifyToYoutubeMusic = require('spotify-to-ytmusic');
const SoundCloud = require("soundcloud-scraper");
const client = new SoundCloud.Client();

const scdl = require('soundcloud-downloader').default;
const NodeZip = require('node-zip');
const ytdlp = require('yt-dlp-exec');
scdl.setClientID(process.env.SOUNDCLOUD_CLIENT_ID);

async function downloadYoutubePlaylist(message, playlistUrl, randomName, rnd5dig, convertArg) {
    return new Promise(async (resolve, reject) => {
        let statusMessage = null;
        const isInteraction = message.deferred !== undefined;
        
        try {
            console.log('Downloading YouTube playlist:', playlistUrl);
            
            if (isInteraction) {
                await message.editReply('⏳ Fetching playlist information...');
            } else {
                statusMessage = await message.reply('⏳ Fetching playlist information...');
            }
            
            // Get playlist info
            let playlistInfo;
            try {
                playlistInfo = await ytdlp(playlistUrl, {
                    dumpSingleJson: true,
                    flatPlaylist: true,
                    noWarnings: true
                });
                if (typeof playlistInfo === 'string') playlistInfo = JSON.parse(playlistInfo);
            } catch (err) {
                console.error('Failed to fetch playlist info:', err);
                if (isInteraction) {
                    await message.editReply('❌ Failed to fetch playlist information');
                } else if (statusMessage) {
                    await statusMessage.edit('❌ Failed to fetch playlist information');
                }
                reject(err);
                return;
            }
            
            const playlistTitle = sanitize(playlistInfo.title || `youtube_playlist_${rnd5dig}`, { replacement: '_' })
                .replace(/[^\w\s-]/g, '')
                .replace(/\s+/g, '_')
                .toLowerCase()
                .slice(0, 100);
            
            // Add user ID to folder name
            const folderName = `${playlistTitle}_${randomName}`;
            
            const entries = playlistInfo.entries || [];
            
            if (entries.length === 0) {
                if (isInteraction) {
                    await message.editReply('❌ Playlist is empty');
                } else if (statusMessage) {
                    await statusMessage.edit('❌ Playlist is empty');
                }
                reject(new Error('Playlist is empty'));
                return;
            }
            
            console.log(`Found ${entries.length} videos in playlist`);
            
            const playlistDir = path.join('temp', folderName);
            if (!fs.existsSync(playlistDir)) {
                fs.mkdirSync(playlistDir, { recursive: true });
            }
            
            if (isInteraction) {
                await message.editReply(`⬇️ Downloading ${entries.length} videos from playlist...`);
            } else if (statusMessage) {
                await statusMessage.edit(`⬇️ Downloading ${entries.length} videos from playlist...`);
            }
            
            // Download each video
            for (let i = 0; i < entries.length; i++) {
                const video = entries[i];
                const videoUrl = video.url || `https://www.youtube.com/watch?v=${video.id}`;
                
                // For audio files, keep original title format. For video, use sanitized version
                let videoTitle;
                if (convertArg) {
                    // Audio: use original YouTube title with minimal sanitization
                    videoTitle = sanitize(video.title || `video_${i + 1}`, { replacement: ' ' })
                        .replace(/[<>:"/\\|?*\x00-\x1f]/g, '') // Remove only invalid filesystem characters
                        .trim()
                        .slice(0, 150);
                } else {
                    // Video: use lowercase sanitized version
                    videoTitle = sanitize(video.title || `video_${i + 1}`, { replacement: '_' })
                        .replace(/[^\w\s-]/g, '')
                        .replace(/\s+/g, '_')
                        .toLowerCase()
                        .slice(0, 150);
                }
                
                console.log(`Downloading video ${i + 1}/${entries.length}: ${video.title}`);
                
                if (isInteraction) {
                    await message.editReply(`⬇️ Downloading video ${i + 1}/${entries.length}: **${video.title?.slice(0, 40) || 'Unknown'}${video.title?.length > 40 ? '...' : ''}**`);
                } else if (statusMessage) {
                    await statusMessage.edit(`⬇️ Downloading video ${i + 1}/${entries.length}: **${video.title?.slice(0, 40) || 'Unknown'}${video.title?.length > 40 ? '...' : ''}**`);
                }
                
                try {
                    const extension = convertArg ? 'mp3' : 'mp4';
                    const fileName = path.join(playlistDir, `${videoTitle}.${extension}`);
                    
                    const ytdlpOptions = {
                        output: path.resolve(fileName),
                        format: convertArg ? 'bestaudio/best' : 'bestvideo[height<=1080]+bestaudio/best[height<=1080]',
                        extractAudio: convertArg || undefined,
                        audioFormat: convertArg ? 'mp3' : undefined,
                        audioQuality: convertArg ? 0 : undefined,
                        noPart: true
                    };
                    
                    if (!convertArg) {
                        ytdlpOptions.mergeOutputFormat = extension;
                    }
                    
                    await ytdlp(videoUrl, ytdlpOptions);
                    
                    // Add metadata for audio files
                    if (convertArg) {
                        const tags = {
                            title: video.title || '',
                            artist: playlistInfo.uploader || playlistInfo.channel || '',
                            album: playlistInfo.title || '',
                            TRCK: `${i + 1}/${entries.length}`
                        };
                        
                        try {
                            NodeID3.write(tags, fileName);
                        } catch (e) {
                            console.warn('Failed to write ID3 tags:', e.message);
                        }
                    }
                } catch (videoErr) {
                    console.error(`Failed to download video ${i + 1}:`, videoErr.message);
                    // Continue with next video
                }
            }
            
            // Zip the playlist folder
            if (isInteraction) {
                await message.editReply('📦 Creating archive...');
            } else if (statusMessage) {
                await statusMessage.edit('📦 Creating archive...');
            }
            
            const zip = new NodeZip();
            const files = fs.readdirSync(playlistDir);
            
            for (const file of files) {
                const filePath = path.join(playlistDir, file);
                const fileData = fs.readFileSync(filePath);
                zip.file(file, fileData);
            }
            
            const zipData = zip.generate({ base64: false, compression: 'DEFLATE' });
            const zipPath = path.join('temp', `${folderName}.zip`);
            fs.writeFileSync(zipPath, zipData, 'binary');
            
            console.log('Playlist zipped successfully');
            
            // Clean up playlist directory
            fs.rmSync(playlistDir, { recursive: true, force: true });
            
            // Don't delete status for interactions, only for message replies
            if (statusMessage && !isInteraction) {
                await statusMessage.delete().catch(console.error);
            }
            
            resolve({
                success: true,
                videoTitle: folderName,
                filename: zipPath,
                isPlaylist: true
            });
            
        } catch (err) {
            console.error('YouTube playlist download error:', err);
            if (isInteraction) {
                await message.editReply(`❌ Error: ${err.message || 'Failed to download playlist'}`).catch(console.error);
            } else if (statusMessage) {
                await statusMessage.edit(`❌ Error: ${err.message || 'Failed to download playlist'}`).catch(console.error);
            }
            reject(err);
        }
    });
}


async function downloadYoutube(message, downloadLink, randomName, rnd5dig, identifierName, convertArg, _isMusic, useIdentifier) {
    return new Promise(async (resolve, reject) => {
        let statusMessage = null;
        const isInteraction = message.deferred !== undefined;
        
        try {
            console.log('Downloading from YouTube using yt-dlp:', downloadLink);

            // Send initial status message
            if (isInteraction) {
                await message.editReply('⏳ Fetching video information...');
            } else {
                statusMessage = await message.reply('⏳ Fetching video information...');
            }

            let infoData;
            try {
                infoData = await ytdlp(downloadLink, {
                    dumpSingleJson: true,
                    noWarnings: true,
                    preferFreeFormats: true,
                    youtubeSkipDashManifest: true
                });
                if (typeof infoData === 'string') infoData = JSON.parse(infoData);
            } catch (metadataErr) {
                console.warn('Could not fetch YouTube metadata:', metadataErr.message);
                if (isInteraction) {
                    await message.editReply('⚠️ Could not fetch video metadata, continuing with download...');
                } else if (statusMessage) {
                    await statusMessage.edit('⚠️ Could not fetch video metadata, continuing with download...');
                }
            }

            const titleUrl = (infoData && infoData.title) || `${randomName}_YT_${rnd5dig}`;
            const thumbnailUrl = infoData?.thumbnail || infoData?.thumbnails?.[0]?.url || infoData?.thumbnails?.[0] || null;
            const duration = infoData?.duration;

            // For audio files, keep the original title format. For video, use sanitized version
            let title;
            if (convertArg) {
                // Audio: use original YouTube title with minimal sanitization
                title = sanitize(titleUrl, { replacement: ' ' })
                    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '') // Remove only invalid filesystem characters
                    .trim()
                    .slice(0, 200);
            } else {
                // Video: use lowercase sanitized version (existing behavior)
                title = sanitize(titleUrl, { replacement: '_' })
                    .replace(/[^\w\s-]/g, '')
                    .replace(/\s+/g, '_')
                    .toLowerCase()
                    .trim()
                    .slice(0, 200);
            }

            const extension = convertArg ? 'mp3' : 'mp4';
            const fileName = useIdentifier
                ? `temp/${randomName}-${identifierName}-${rnd5dig}.${extension}`
                : `temp/${title}.${extension}`;
            const resolvedOutput = path.resolve(fileName);

            // Update status with video title and estimated time
            const formatType = convertArg ? 'audio' : 'video';
            let estimatedTime = 'a few moments';
            if (duration) {
                const estimateSeconds = Math.ceil(duration / 10); // Rough estimate: 1 second download per 10 seconds of video
                if (estimateSeconds < 60) {
                    estimatedTime = `~${estimateSeconds}s`;
                } else if (estimateSeconds < 3600) {
                    estimatedTime = `~${Math.ceil(estimateSeconds / 60)}m`;
                } else {
                    estimatedTime = 'several minutes';
                }
            }
            
            const durationStr = duration ? ` (${Math.floor(duration / 60)}:${String(Math.floor(duration % 60)).padStart(2, '0')})` : '';
            
            if (isInteraction) {
                await message.editReply(`⬇️ Downloading ${formatType}: **${titleUrl.slice(0, 45)}${titleUrl.length > 45 ? '...' : ''}**${durationStr}\nEstimated time: ${estimatedTime}`);
            } else if (statusMessage) {
                await statusMessage.edit(`⬇️ Downloading ${formatType}: **${titleUrl.slice(0, 45)}${titleUrl.length > 45 ? '...' : ''}**${durationStr}\nEstimated time: ${estimatedTime}`);
            }

            const ytdlpOptions = {
                output: resolvedOutput,
                format: convertArg ? 'bestaudio/best' : 'bestvideo[height<=1080]+bestaudio/best[height<=1080]',
                extractAudio: convertArg || undefined,
                audioFormat: convertArg ? 'mp3' : undefined,
                audioQuality: convertArg ? 0 : undefined,
                noPart: true
            };

            if (!convertArg) {
                ytdlpOptions.mergeOutputFormat = extension;
            }

            // Track download progress
            let lastUpdate = Date.now();
            const updateInterval = 3000; // Update every 3 seconds
            let downloadStarted = false;

            try {
                // Use the yt-dlp-exec package which returns a child process
                const ytdlpProcess = ytdlp.exec(downloadLink, ytdlpOptions);
                
                // Listen to stderr for progress updates (yt-dlp outputs progress to stderr)
                if (ytdlpProcess.stderr) {
                    ytdlpProcess.stderr.on('data', (data) => {
                        const output = data.toString();
                        const now = Date.now();
                        
                        // Check for download progress
                        const downloadMatch = output.match(/\[download\]\s+(\d+\.?\d*)%/);
                        if (downloadMatch && now - lastUpdate > updateInterval) {
                            const percent = parseFloat(downloadMatch[1]).toFixed(1);
                            downloadStarted = true;
                            const updateMsg = `⬇️ Downloading: **${titleUrl.slice(0, 50)}${titleUrl.length > 50 ? '...' : ''}**\nProgress: ${percent}%`;
                            
                            if (isInteraction) {
                                message.editReply(updateMsg).catch(console.error);
                            } else if (statusMessage) {
                                statusMessage.edit(updateMsg).catch(console.error);
                            }
                            lastUpdate = now;
                        }
                        
                        // Check for merge/post-processing
                        if (output.includes('[Merger]') || output.includes('Merging formats')) {
                            if (downloadStarted) {
                                if (isInteraction) {
                                    message.editReply('🔄 Merging video and audio...').catch(console.error);
                                } else if (statusMessage) {
                                    statusMessage.edit('🔄 Merging video and audio...').catch(console.error);
                                }
                            }
                        }
                        
                        // Check for extraction progress
                        if (output.includes('[ExtractAudio]')) {
                            if (isInteraction) {
                                message.editReply('🎵 Extracting audio...').catch(console.error);
                            } else if (statusMessage) {
                                statusMessage.edit('🎵 Extracting audio...').catch(console.error);
                            }
                        }
                    });
                }

                await ytdlpProcess;
            } catch (downloadErr) {
                console.error('yt-dlp download error:', downloadErr);
                
                // Parse common yt-dlp errors
                let errorMessage = 'Unknown error occurred';
                const errString = downloadErr.message || downloadErr.stderr || '';
                
                if (errString.includes('Video unavailable')) {
                    errorMessage = 'Video is unavailable or private';
                } else if (errString.includes('This video is not available')) {
                    errorMessage = 'Video not available in your region';
                } else if (errString.includes('Sign in to confirm your age')) {
                    errorMessage = 'Age-restricted video (cannot download)';
                } else if (errString.includes('Premieres in')) {
                    errorMessage = 'Video is a premiere and not yet available';
                } else if (errString.includes('This live event will begin')) {
                    errorMessage = 'Live stream has not started yet';
                } else if (errString.includes('Private video')) {
                    errorMessage = 'Video is private';
                } else if (errString.includes('members-only')) {
                    errorMessage = 'Members-only video';
                } else if (errString.includes('Join this channel')) {
                    errorMessage = 'Members-only content';
                } else if (errString.includes('HTTP Error 429')) {
                    errorMessage = 'Rate limited by YouTube. Try again later';
                } else if (errString.includes('unable to extract')) {
                    errorMessage = 'Could not extract video information';
                } else if (downloadErr.message) {
                    errorMessage = downloadErr.message.slice(0, 100);
                }
                
                if (isInteraction) {
                    await message.editReply(`❌ Download failed: ${errorMessage}`);
                } else if (statusMessage) {
                    await statusMessage.edit(`❌ Download failed: ${errorMessage}`);
                }
                reject(new Error(`Download failed: ${errorMessage}`));
                return;
            }

            // Post-processing phase
            if (isInteraction) {
                await message.editReply(`🔄 Processing ${formatType}...`);
            } else if (statusMessage) {
                await statusMessage.edit(`🔄 Processing ${formatType}...`);
            }

            if (convertArg) {
                let tags = {
                    title: titleUrl || '',
                    artist: '',
                    album: '',
                    year: '',
                    genre: ''
                };

                if (thumbnailUrl) {
                    try {
                        const response = await axios.get(thumbnailUrl, { responseType: 'arraybuffer' });
                        const safeTitle = titleUrl.replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 32) || 'cover';
                        const coverPath = path.join('temp', `${safeTitle}_cover.jpg`);
                        fs.writeFileSync(coverPath, response.data);

                        const getImageDimensions = (filePath) => {
                            return new Promise((resolve, reject) => {
                                ffmpeg.ffprobe(filePath, (err, metadata) => {
                                    if (err) return reject(err);
                                    const { width, height } = metadata.streams[0];
                                    resolve({ width, height });
                                });
                            });
                        };

                        const dimensions = await getImageDimensions(coverPath);
                        const size = Math.min(dimensions.width, dimensions.height) * 0.75;
                        const x = (dimensions.width - size) / 2;
                        const y = (dimensions.height - size) / 2;
                        const croppedCoverPath = path.join('temp', `${safeTitle}_cover_cropped.jpg`);

                        await new Promise((res, rej) => {
                            ffmpeg(coverPath)
                                .outputOptions([`-vf crop=${size}:${size}:${x}:${y}`])
                                .on('end', res)
                                .on('error', rej)
                                .save(croppedCoverPath);
                        });

                        const imageBuffer = fs.readFileSync(croppedCoverPath);

                        tags.APIC = {
                            mime: 'image/jpeg',
                            type: { id: 3, name: 'front cover' },
                            description: 'Cover',
                            imageBuffer
                        };

                        fs.unlinkSync(coverPath);
                        fs.unlinkSync(croppedCoverPath);
                    } catch (e) {
                        console.warn('Could not download or crop cover art:', e.message);
                    }
                }

                try {
                    NodeID3.write(tags, fileName);
                    console.log('ID3 tags written');
                } catch (e) {
                    console.warn('Failed to write ID3 tags:', e.message);
                }
            }

            // Delete status message after successful download (only for non-interaction)
            if (statusMessage && !isInteraction) {
                await statusMessage.delete().catch(console.error);
            }

            resolve({
                success: true,
                filename: fileName,
                videoTitle: title
            });

        } catch (err) {
            console.error('Download error:', err.message);
            if (isInteraction) {
                await message.editReply(`❌ Error: ${err.message || 'Unknown error occurred'}`).catch(console.error);
            } else if (statusMessage) {
                await statusMessage.edit(`❌ Error: ${err.message || 'Unknown error occurred'}`).catch(console.error);
            }
            reject(err);
        }
    });
}

async function downloadSoundCloud(message, sanitizedLink, randomName, rnd5dig, identifierName, useIdentifier) {
    return new Promise(async (resolve, reject) => {
        let statusMessage = null;
        const isInteraction = message.deferred !== undefined;
        
        try {
            console.log('Downloading from SoundCloud:', sanitizedLink);

            if (isInteraction) {
                await message.editReply('⏳ Fetching SoundCloud track information...');
            } else {
                statusMessage = await message.reply('⏳ Fetching SoundCloud track information...');
            }

            // if link includes "sets", use soundcloud-scraper to get playlist tracks
            if (sanitizedLink.includes('/sets/')) {
                try {
                    const playlist = await client.getPlaylist(sanitizedLink);
                    console.log('SoundCloud playlist info:', playlist);
                    console.log('Number of tracks:', playlist.tracks?.length || 0);
                    
                    if (!playlist.tracks || playlist.tracks.length === 0) {
                        if (isInteraction) {
                            await message.editReply('❌ Playlist is empty or could not be fetched.');
                        } else if (statusMessage) {
                            await statusMessage.edit('❌ Playlist is empty or could not be fetched.');
                        }
                        reject(new Error('Playlist is empty or could not be fetched.'));
                        return;
                    }

                    const playlistTitle = sanitize(playlist.title || `soundcloud_playlist_${rnd5dig}`, { replacement: '_' }).replace(/\s+/g, '_').slice(0, 100);
                    const playlistDir = path.join('temp', playlistTitle);
                    
                    // Create directory for playlist
                    if (!fs.existsSync(playlistDir)) {
                        fs.mkdirSync(playlistDir, { recursive: true });
                    }

                    if (isInteraction) {
                        await message.editReply(`⬇️ Downloading ${playlist.tracks.length} tracks from playlist...`);
                    } else if (statusMessage) {
                        await statusMessage.edit(`⬇️ Downloading ${playlist.tracks.length} tracks from playlist...`);
                    }

                    console.log(`Downloading ${playlist.tracks.length} tracks...`);
                    
                    // Helper function to fetch MusicBrainz metadata
                    async function getMusicBrainzMetadata(title, artist) {
                        try {
                            console.log('Searching MusicBrainz for:', title, artist);
                            const mbSearchUrl = `https://musicbrainz.org/ws/2/recording/?query=recording:"${encodeURIComponent(title)}"%20AND%20artist:"${encodeURIComponent(artist)}"&fmt=json&limit=1`;
                            const mbResponse = await axios.get(mbSearchUrl, { headers: { 'User-Agent': 'chocbot/1.0 ( https://github.com/choccybox/chocbot )' } });
                            const recordings = mbResponse.data.recordings;
                            
                            if (recordings && recordings.length > 0) {
                                const rec = recordings[0];
                                return {
                                    artist: rec['artist-credit']?.[0]?.name || artist,
                                    album_artist: rec['artist-credit']?.[0]?.name || artist,
                                    year: rec['first-release-date'] ? rec['first-release-date'].split('-')[0] : '',
                                    album: rec.releases?.[0]?.title || '',
                                    TRCK: rec.releases?.[0]?.media?.[0]?.['track-offset'] || ''
                                };
                            }
                            return null;
                        } catch (err) {
                            console.error('MusicBrainz lookup failed:', err.message);
                            return null;
                        }
                    }
                    
                    // Download each track
                    for (let i = 0; i < playlist.tracks.length; i++) {
                        const track = playlist.tracks[i];
                        console.log(`Downloading track ${i + 1}/${playlist.tracks.length}: ${track.title}`);
                        
                        if (isInteraction) {
                            await message.editReply(`⬇️ Downloading track ${i + 1}/${playlist.tracks.length}: **${track.title.slice(0, 40)}${track.title.length > 40 ? '...' : ''}**`);
                        } else if (statusMessage) {
                            await statusMessage.edit(`⬇️ Downloading track ${i + 1}/${playlist.tracks.length}: **${track.title.slice(0, 40)}${track.title.length > 40 ? '...' : ''}**`);
                        }
                        
                        try {
                            const searchTitle = track.title || '';
                            const searchArtist = track.user?.username || '';
                            
                            // Get MusicBrainz metadata
                            const mbData = await getMusicBrainzMetadata(searchTitle, searchArtist);
                            
                            // Prepare tags
                            let tags = {
                                title: searchTitle,
                                artist: mbData?.artist || searchArtist,
                                TPE2: mbData?.album_artist || searchArtist,
                                album: mbData?.album || '',
                                year: mbData?.year || '',
                                TRCK: mbData?.TRCK || '',
                                genre: ''
                            };
                            
                            const trackFileName = path.join(playlistDir, `${String(i + 1).padStart(2, '0')}_${sanitize(searchTitle, { replacement: '_' }).slice(0, 150)}.mp3`);
                            const stream = await scdl.download(track.url);
                            const writer = fs.createWriteStream(trackFileName);
                            stream.pipe(writer);
                            
                            await new Promise((res, rej) => {
                                writer.on('finish', res);
                                writer.on('error', rej);
                            });
                            
                            // Download and add cover art if available
                            const coverUrl = track.artwork_url;
                            if (coverUrl) {
                                try {
                                    const response = await axios.get(coverUrl, { responseType: 'arraybuffer' });
                                    const safeTitle = searchTitle.replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 32) || 'cover';
                                    const coverPath = path.join('temp', `${safeTitle}_cover_${i}.jpg`);
                                    fs.writeFileSync(coverPath, response.data);

                                    const getImageDimensions = (filePath) => {
                                        return new Promise((resolve, reject) => {
                                            ffmpeg.ffprobe(filePath, (err, metadata) => {
                                                if (err) return reject(err);
                                                const { width, height } = metadata.streams[0];
                                                resolve({ width, height });
                                            });
                                        });
                                    };

                                    const dimensions = await getImageDimensions(coverPath);
                                    const size = Math.min(dimensions.width, dimensions.height);
                                    const croppedCoverPath = path.join('temp', `${safeTitle}_cover_cropped_${i}.jpg`);

                                    await new Promise((res, rej) => {
                                        ffmpeg(coverPath)
                                            .outputOptions([`-vf crop=${size}:${size}`])
                                            .on('end', res)
                                            .on('error', rej)
                                            .save(croppedCoverPath);
                                    });

                                    const imageBuffer = fs.readFileSync(croppedCoverPath);
                                    tags.APIC = {
                                        mime: 'image/jpeg',
                                        type: { id: 3, name: 'front cover' },
                                        description: 'Cover',
                                        imageBuffer
                                    };

                                    fs.unlinkSync(coverPath);
                                    fs.unlinkSync(croppedCoverPath);
                                } catch (e) {
                                    console.warn('Could not download or crop cover art:', e.message);
                                }
                            }
                            
                            // Write ID3 tags
                            try {
                                NodeID3.write(tags, trackFileName);
                                console.log('ID3 tags written for track', i + 1);
                            } catch (e) {
                                console.warn('Failed to write ID3 tags:', e.message);
                            }
                            
                        } catch (trackErr) {
                            console.error(`Failed to download track ${i + 1}:`, trackErr.message);
                        }
                    }

                    // Zip the playlist folder using node-zip
                    if (isInteraction) {
                        await message.editReply('📦 Creating archive...');
                    } else if (statusMessage) {
                        await statusMessage.edit('📦 Creating archive...');
                    }
                    
                    const zip = new NodeZip();
                    
                    const files = fs.readdirSync(playlistDir);
                    for (const file of files) {
                        const filePath = path.join(playlistDir, file);
                        const fileData = fs.readFileSync(filePath);
                        zip.file(file, fileData);
                    }
                    
                    const zipData = zip.generate({ base64: false, compression: 'DEFLATE' });
                    const zipPath = path.join('temp', `${playlistTitle}.zip`);
                    fs.writeFileSync(zipPath, zipData, 'binary');
                    
                    console.log(`Playlist zipped successfully`);
                    
                    fs.rmSync(playlistDir, { recursive: true, force: true });
                    
                    if (statusMessage && !isInteraction) {
                        await statusMessage.delete().catch(console.error);
                    }
                    
                    resolve({
                        success: true,
                        videoTitle: playlistTitle,
                        filename: zipPath,
                        isPlaylist: true
                    });
                    
                } catch (err) {
                    console.error('Error fetching SoundCloud playlist info:', err.message);
                    if (isInteraction) {
                        await message.editReply(`❌ Error: ${err.message || 'Failed to download playlist'}`);
                    } else if (statusMessage) {
                        await statusMessage.edit(`❌ Error: ${err.message || 'Failed to download playlist'}`);
                    }
                    reject(err);    
                }
                return;
            }
            
            // Get song info using soundcloud-downloader
            const songInfo = await scdl.getInfo(sanitizedLink);
            console.log('SoundCloud song info:', songInfo);
            
            // Extract search information for metadata
            const searchTitle = songInfo.title || '';
            const searchArtist = songInfo.user?.username || '';

            if (isInteraction) {
                await message.editReply(`⬇️ Downloading: **${searchTitle.slice(0, 50)}${searchTitle.length > 50 ? '...' : ''}**`);
            } else if (statusMessage) {
                await statusMessage.edit(`⬇️ Downloading: **${searchTitle.slice(0, 50)}${searchTitle.length > 50 ? '...' : ''}**`);
            }

            let tags = {
                title: searchTitle,
                artist: searchArtist,
                album: '',
                year: '',
                trackNumber: '',
                genre: '',
                APIC: undefined,
                TRCK: undefined
            };

            // Query MusicBrainz for metadata
            let mbData = {};
            let mbFailed = false;
            try {
                // Search MusicBrainz for the song title and artist
                console.log('Searching MusicBrainz for:', searchTitle, searchArtist);
                const mbSearchUrl = `https://musicbrainz.org/ws/2/recording/?query=recording:"${encodeURIComponent(searchTitle)}"%20AND%20artist:"${encodeURIComponent(searchArtist)}"&fmt=json&limit=1`;
                const mbResponse = await axios.get(mbSearchUrl, { headers: { 'User-Agent': 'chocbot/1.0 ( https://github.com/choccybox/chocbot )' } });
                const recordings = mbResponse.data.recordings;
                
                if (recordings && recordings.length > 0) {
                    const rec = recordings[0];
                    mbData = {
                        artist: rec['artist-credit'] && rec['artist-credit'][0]?.name ? rec['artist-credit'][0].name : searchArtist,
                        album_artist: rec['artist-credit'] && rec['artist-credit'][0]?.name ? rec['artist-credit'][0].name : searchArtist,
                        year: rec['first-release-date'] ? rec['first-release-date'].split('-')[0] : '',
                        album: rec.releases && rec.releases.length > 0 ? rec.releases[0].title : '',
                        cover: songInfo.artwork_url,
                        TRCK: rec.releases && rec.releases.length > 0 && rec.releases[0].media && rec.releases[0].media[0]['track-offset'] ? rec.releases[0].media[0]['track-offset'] : ''
                    };
                    console.log('MusicBrainz data:', mbData);
                } else {
                    mbFailed = true;
                }
            } catch (err) {
                console.error('MusicBrainz lookup failed:', err);
                mbFailed = true;
            }

            // If MusicBrainz failed, use SoundCloud for cover art and fallback metadata
            if (mbFailed) {
                mbData = {
                    artist: searchArtist,
                    year: '',
                    genre: '',
                    album: '',
                    publisher: '',
                    cover: songInfo.artwork_url
                };
            }

            // Fill tags from MusicBrainz if available
            tags.artist = mbData.artist || tags.artist;
            tags.TPE2 = mbData.album_artist || tags.TPE2; // TPE2 is the ID3v2 tag for album artist
            tags.year = mbData.year || tags.year;
            tags.genre = mbData.genre || tags.genre;
            tags.album = mbData.album || tags.album;
            tags.TRCK = mbData.TRCK || tags.TRCK;

            const fileName = useIdentifier
                ? `temp/${randomName}-${identifierName}-${rnd5dig}.mp3`
                : `temp/${sanitize(searchTitle, { replacement: '_' }).slice(0, 200)}.mp3`;

            // Download the song using soundcloud-downloader
            const stream = await scdl.download(sanitizedLink);
            const writer = fs.createWriteStream(fileName);
            
            stream.pipe(writer);

            writer.on("finish", async () => {
                console.log("Finished writing song");

                if (isInteraction) {
                    await message.editReply('🔄 Processing audio and metadata...');
                } else if (statusMessage) {
                    await statusMessage.edit('🔄 Processing audio and metadata...');
                }

                // Get file size for under 10MB check
                const stats = fs.statSync(fileName);
                const fileSizeInBytes = stats.size;

                // Download and crop album art if available
                const coverUrl = mbData.cover;
                if (coverUrl) {
                    try {
                        // Download the cover image
                        const response = await axios.get(coverUrl, { responseType: 'arraybuffer' });
                        const safeTitle = searchTitle.replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 32) || 'cover';
                        const coverPath = path.join('temp', `${safeTitle}_cover.jpg`);
                        fs.writeFileSync(coverPath, response.data);

                        // Get image dimensions using ffmpeg
                        const getImageDimensions = (filePath) => {
                            return new Promise((resolve, reject) => {
                                ffmpeg.ffprobe(filePath, (err, metadata) => {
                                    if (err) return reject(err);
                                    const { width, height } = metadata.streams[0];
                                    resolve({ width, height });
                                });
                            });
                        };

                        const dimensions = await getImageDimensions(coverPath);
                        const size = Math.min(dimensions.width, dimensions.height);
                        const croppedCoverPath = path.join('temp', `${safeTitle}_cover_cropped.jpg`);

                        // Crop the image into a square using ffmpeg
                        await new Promise((res, rej) => {
                            ffmpeg(coverPath)
                                .outputOptions([`-vf crop=${size}:${size}`])
                                .on('end', res)
                                .on('error', rej)
                                .save(croppedCoverPath);
                        });

                        // Read cropped image as buffer
                        const imageBuffer = fs.readFileSync(croppedCoverPath);

                        tags.APIC = {
                            mime: 'image/jpeg',
                            type: {
                                id: 3,
                                name: 'front cover'
                            },
                            description: 'Cover',
                            imageBuffer
                        };

                        // Clean up cover images after tagging
                        fs.unlinkSync(coverPath);
                        fs.unlinkSync(croppedCoverPath);
                    } catch (e) {
                        console.warn('Could not download or crop cover art:', e.message);
                    }
                }

                // Write tags
                try {
                    NodeID3.write(tags, fileName);
                    console.log('ID3 tags written');
                } catch (e) {
                    console.warn('Failed to write ID3 tags:', e.message);
                }

                if (statusMessage && !isInteraction) {
                    await statusMessage.delete().catch(console.error);
                }

                resolve({
                    success: true,
                    videoTitle: searchTitle || fileName,
                    filename: fileName,
                    isUnder10MB: fileSizeInBytes < 10 * 1024 * 1024 // Check if the file is under 10 MB
                });
            });

            writer.on("error", (err) => {
                console.error('Write error:', err.message);
                if (isInteraction) {
                    message.editReply(`❌ Error: ${err.message || 'Download failed'}`).catch(console.error);
                } else if (statusMessage) {
                    statusMessage.edit(`❌ Error: ${err.message || 'Download failed'}`).catch(console.error);
                }
                reject(err);
            });

        } catch (err) {
            console.error('Download error:', err.message);
            if (isInteraction) {
                await message.editReply(`❌ Error: ${err.message || 'Unknown error occurred'}`).catch(console.error);
            } else if (statusMessage) {
                await statusMessage.edit(`❌ Error: ${err.message || 'Unknown error occurred'}`).catch(console.error);
            }
            reject(err);
        }
    });
}

async function downloadSpotify(message, downloadLink, randomName, rnd5dig, identifierName, useIdentifier) {
    return new Promise(async (resolve, reject) => {
        let statusMessage = null;
        const isInteraction = message.deferred !== undefined;
        
        try {
            console.log('Downloading from Spotify:', downloadLink);
            
            if (isInteraction) {
                await message.editReply('⏳ Searching for Spotify track on YouTube...');
            } else {
                statusMessage = await message.reply('⏳ Searching for Spotify track on YouTube...');
            }
            
            // Extract Spotify track ID from URL
            let trackId;
            if (downloadLink.includes('/track/')) {
                trackId = downloadLink.split('/track/')[1].split('?')[0];
            } else {
                if (isInteraction) {
                    await message.editReply('❌ Invalid Spotify URL');
                } else if (statusMessage) {
                    await statusMessage.edit('❌ Invalid Spotify URL');
                }
                throw new Error('Invalid Spotify URL: Could not extract track ID');
            }
            
            console.log('Spotify track ID:', trackId);
            
            // Initialize SpotifyToYoutubeMusic
            const spotifyToYoutubeMusic = await SpotifyToYoutubeMusic({
                clientID: process.env.SPOTIFY_CLIENT_ID,
                clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
                ytMusicUrl: false // Set to false to get regular YouTube URL
            });
            
            // Get YouTube URL for the Spotify track
            const youtubeUrl = await spotifyToYoutubeMusic(trackId);
            
            if (!youtubeUrl) {
                console.log('No YouTube URL found for Spotify track:', trackId);
                if (isInteraction) {
                    await message.editReply('❌ Could not find this track on YouTube');
                } else if (statusMessage) {
                    await statusMessage.edit('❌ Could not find this track on YouTube');
                }
                return resolve({ success: false, message: 'Could not find a YouTube equivalent for this Spotify track' });
            }
            
            console.log('Found YouTube URL:', youtubeUrl);
            
            if (isInteraction) {
                await message.editReply('✅ Found on YouTube, downloading...');
            } else if (statusMessage) {
                await statusMessage.edit('✅ Found on YouTube, downloading...');
                // Delete this status message as downloadYoutube will create its own
                setTimeout(() => statusMessage.delete().catch(console.error), 2000);
            }
            
            // Use downloadYoutube to download the video as MP3
            return downloadYoutube(message, youtubeUrl, randomName, rnd5dig, identifierName, true, true, useIdentifier).then(result => {
                resolve({
                    success: true,
                    filename: result.filename,
                    videoTitle: result.videoTitle
                });
            }).catch(err => {
                console.error('Error downloading from YouTube:', err);
                if (isInteraction) {
                    message.editReply(`❌ Error: ${err.message || 'Failed to download from YouTube'}`).catch(console.error);
                } else if (statusMessage) {
                    statusMessage.edit(`❌ Error: ${err.message || 'Failed to download from YouTube'}`).catch(console.error);
                }
                reject(err);
            });
            
        } catch (err) {
            console.error('Spotify download error:', err.message);
            if (isInteraction) {
                await message.editReply(`❌ Error: ${err.message || 'Unknown error occurred'}`).catch(console.error);
            } else if (statusMessage) {
                await statusMessage.edit(`❌ Error: ${err.message || 'Unknown error occurred'}`).catch(console.error);
            }
            reject(err);
        }
    });
}

async function convertToMP3(input, output) {
    const maxRetries = 3;
    const retryDelay = 3000; // 3 seconds

    // Ensure temp directory exists
    if (!fs.existsSync('temp')) {
        fs.mkdirSync('temp');
    }

    console.log(`Converting ${input} to ${output}`);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            if (!fs.existsSync(input)) {
                console.log(`MP4 file not found, attempt ${attempt}/${maxRetries}. Waiting...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                continue;
            }

            await new Promise((resolve, reject) => {
                ffmpeg(input)
                    .toFormat('mp3')
                    .on('end', resolve)
                    .on('error', reject)
                    .save(output);
            });
            
            // Delete the input file after successful conversion
            await fs.promises.unlink(input);
            console.log(`Input file ${input} deleted after conversion`);
            
            return;
        } catch (error) {
            console.log(`Conversion attempt ${attempt} failed:`, error.message);
            if (attempt === maxRetries) {
                throw error;
            }
            await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
    }
    throw new Error('Failed to convert file after multiple attempts');
}

async function downloadURL(message, downloadLink, randomName, rnd5dig, identifierName, convertArg, useIdentifier) {
    try {
        if (/youtube\.com|youtu\.be|music\.youtube\.com/.test(downloadLink)) {
            message.react('🔽').catch()
            
            // Check if it's a playlist
            if (downloadLink.includes('list=') || downloadLink.includes('/playlist')) {
                const result = await downloadYoutubePlaylist(message, downloadLink, randomName, rnd5dig, convertArg);
                return result.success 
                    ? { success: true, title: result.videoTitle, isPlaylist: true }
                    : { success: false, message: result.message };
            }
            
            if (downloadLink.includes('music.youtube.com')) {
                downloadLink = downloadLink.replace('music.', '');
                const result = await downloadYoutube(message, downloadLink, randomName, rnd5dig, identifierName, convertArg, isMusic = true, useIdentifier);
                return result.success 
                ? { success: true, title: result.videoTitle }
                : { success: false, message: result.message };
            } else {
                const result = await downloadYoutube(message, downloadLink, randomName, rnd5dig, identifierName, convertArg, isMusic = false, useIdentifier);
                return result.success 
                ? { success: true, title: result.videoTitle }
                : { success: false, message: result.message };
            }
        } else if (/twitter\.com|t\.co|x\.com|fxtwitter\.com|stupidpenisx\.com/.test(downloadLink)) {
            try {
                const isInteraction = message.deferred !== undefined;
                let statusMsg = null;
                
                if (isInteraction) {
                    await message.editReply('⏳ Downloading from Twitter/X...');
                } else {
                    statusMsg = await message.reply('⏳ Downloading from Twitter/X...').catch(() => null);
                    message.react('🔽').catch();
                }
                
                // Convert fxtwitter and stupidpenisx URLs to twitter.com
                let twitterUrl = downloadLink;
                if (downloadLink.includes('fxtwitter.com')) {
                    twitterUrl = downloadLink.replace('fxtwitter.com', 'twitter.com');
                } else if (downloadLink.includes('stupidpenisx.com')) {
                    twitterUrl = downloadLink.replace('stupidpenisx.com', 'twitter.com');
                }
                const data = await twitter(twitterUrl);
                const downloadUrl = data.url[0].sd || data.url[0].hd;
                console.log(data);
                if (!downloadUrl) {
                    if (isInteraction) {
                        await message.editReply('❌ Could not find video or it\'s marked as NSFW');
                    } else if (statusMsg) {
                        await statusMsg.edit('❌ Could not find video or it\'s marked as NSFW');
                    }
                    return { success: false, message: `couldn't find a video or it's marked as NSFW.` };
                }
                const response = await axios({
                    method: 'get',
                    url: downloadUrl,
                    responseType: 'stream',
                    timeout: 30000,
                    maxRedirects: 5
                });
                let title = `${data.title || `twitter_video_${randomName}_${rnd5dig}`}` // use title if available, otherwise use default
                    .replace(/https?:\/\/\S+/gi, '') // remove URLs
                    .split(' ').slice(0, 6).join(' ') // get first 6 words
                    .replace(/\s+/g, '_') // replace spaces with underscores
                    .toLowerCase()
                    .trim(); // remove trailing/leading whitespace
                
                // Check if title is empty after processing and use default if needed
                if (!title || title.length === 0) {
                    title = `twitter_video_${randomName}_${rnd5dig}`;
                }
                
                // Limit length after ensuring we have a valid title
                title = title.slice(0, 200);
                
                const downloadStream = fs.createWriteStream(`temp/${title}.mp4`);
                response.data.pipe(downloadStream);
                await new Promise((resolve, reject) => {
                    downloadStream.on('finish', resolve);
                    downloadStream.on('error', reject);
                });
                
                if (statusMsg && !isInteraction) {
                    await statusMsg.delete().catch(console.error);
                }
                
                if (convertArg) {
                    if (useIdentifier) {
                        console.log('using identifier:', useIdentifier);
                        const newFileName = `temp/${randomName}-${identifierName}-${rnd5dig}.mp3`;
                        await convertToMP3(`temp/${title}.mp4`, `temp/${title}.mp3`);
                        fs.renameSync(`temp/${title}.mp3`, newFileName);
                        console.log(`Renamed file to ${newFileName}`);
                        return { success: true, title: newFileName };
                    }
                    await convertToMP3(`temp/${title}.mp4`, `temp/${title}.mp3`);
                    return { success: true, title };
                }
                return { success: true, title };
            } catch (error) {
                console.error('Twitter download error:', error);
                const isInteraction = message.deferred !== undefined;
                if (isInteraction) {
                    await message.editReply('❌ Could not download from Twitter/X. Error: ' + (error.message || 'Unknown error'));
                } else {
                    await message.reply('❌ Could not download from Twitter/X. Error: ' + (error.message || 'Unknown error'));
                }
                return { success: false, message: 'Twitter download failed: ' + (error.message || 'Unknown error') };
            }
        } else if (/instagram\.com/.test(downloadLink)) {
            try {
                const isInteraction = message.deferred !== undefined;
                let statusMsg = null;
                
                if (isInteraction) {
                    await message.editReply('⏳ Downloading from Instagram...');
                } else {
                    statusMsg = await message.reply('⏳ Downloading from Instagram...').catch(() => null);
                    message.react('🔽').catch();
                }
                
                const data = await igdl(downloadLink);
                const downloadUrl = data[0].url;
                //console.log(data);
                if (!downloadUrl) {
                    if (isInteraction) {
                        await message.editReply('❌ Could not find video or it\'s marked as private');
                    } else if (statusMsg) {
                        await statusMsg.edit('❌ Could not find video or it\'s marked as private');
                    }
                    return { success: false, message: `couldn't find a video or it's marked as private.` };
                }
                const response = await axios({
                    method: 'get',
                    url: downloadUrl,
                    responseType: 'stream',
                    timeout: 30000,
                    maxRedirects: 5
                });
                
                const title = `instagram_video_${randomName}_${rnd5dig}`
                    .replace(/https?:\/\/\S+/gi, '')
                    .split(' ').slice(0, 6).join(' ')
                    .replace(/\s+/g, '_') // replace spaces with underscores
                    .toLowerCase()
                    .slice(0, 200);
                
                const downloadStream = fs.createWriteStream(`temp/${title}.mp4`);
                response.data.pipe(downloadStream);
                await new Promise((resolve, reject) => {
                    downloadStream.on('finish', resolve);
                    downloadStream.on('error', reject);
                });
                
                if (statusMsg && !isInteraction) {
                    await statusMsg.delete().catch(console.error);
                }
                
                if (convertArg) {
                    if (useIdentifier) {
                        console.log('using identifier:', useIdentifier);
                        const newFileName = `temp/${randomName}-${identifierName}-${rnd5dig}.mp3`;
                        await convertToMP3(`temp/${title}.mp4`, `temp/${title}.mp3`);
                        fs.renameSync(`temp/${title}.mp3`, newFileName);
                        console.log(`Renamed file to ${newFileName}`);
                        return { success: true, title: newFileName };
                    }
                    await convertToMP3(`temp/${title}.mp4`, `temp/${title}.mp3`);
                    return { success: true, title };
                }
                return { success: true, title };
            } catch (error) {
                console.error('Instagram download error:', error);
                const isInteraction = message.deferred !== undefined;
                if (isInteraction) {
                    await message.editReply('❌ Could not download from Instagram. Error: ' + (error.message || 'Unknown error'));
                } else {
                    await message.reply('❌ Could not download from Instagram. Error: ' + (error.message || 'Unknown error'));
                }
                return { success: false, message: 'Instagram download failed: ' + (error.message || 'Unknown error') };
            }
        } else if (/tiktok\.com/.test(downloadLink)) {
            try {
                const isInteraction = message.deferred !== undefined;
                let statusMsg = null;
                
                if (isInteraction) {
                    await message.editReply('⏳ Downloading from TikTok...');
                } else {
                    statusMsg = await message.reply('⏳ Downloading from TikTok...').catch(() => null);
                    message.react('🔽').catch();
                }
                
                const data = await ttdl(downloadLink);
                const downloadUrl = data.video[0];
                console.log(data);
                if (!downloadUrl) {
                    if (isInteraction) {
                        await message.editReply('❌ Could not find the video');
                    } else if (statusMsg) {
                        await statusMsg.edit('❌ Could not find the video');
                    }
                    return { success: false, message: `couldn't find the video.` };
                }
                const response = await axios({
                    method: 'get',
                    url: downloadUrl,
                    responseType: 'stream',
                    timeout: 30000,
                    maxRedirects: 5
                });

                let title = `${data.title || `tiktok_video_${randomName}_${rnd5dig}`}` // use title if available, otherwise use default
                    .replace(/https?:\/\/\S+/gi, '') // remove URLs
                    .split(' ').slice(0, 6).join(' ') // get first 6 words
                    .replace(/\s+/g, '_') // replace spaces with underscores
                    .toLowerCase()
                    .trim(); // remove trailing/leading whitespace
                
                // Check if title is empty after processing and use default if needed
                if (!title || title.length === 0) {
                    title = `tiktok_video_${randomName}_${rnd5dig}`;
                }
                
                const downloadStream = fs.createWriteStream(`temp/${title}.mp4`);
                response.data.pipe(downloadStream);
                await new Promise((resolve, reject) => {
                    downloadStream.on('finish', resolve);
                    downloadStream.on('error', reject);
                });
                
                if (statusMsg && !isInteraction) {
                    await statusMsg.delete().catch(console.error);
                }
                
                if (convertArg) {
                    if (useIdentifier) {
                        console.log('using identifier:', useIdentifier);
                        const newFileName = `temp/${randomName}-${identifierName}-${rnd5dig}.mp3`;
                        await convertToMP3(`temp/${title}.mp4`, `temp/${title}.mp3`);
                        fs.renameSync(`temp/${title}.mp3`, newFileName);
                        console.log(`Renamed file to ${newFileName}`);
                        return { success: true, title: newFileName };
                    }
                    await convertToMP3(`temp/${title}.mp4`, `temp/${title}.mp3`);
                    return { success: true, title };
                }
                return { success: true, title };
            } catch (error) {
                console.error('TikTok download error:', error);
                const isInteraction = message.deferred !== undefined;
                if (isInteraction) {
                    await message.editReply('❌ Could not download from TikTok. Error: ' + (error.message || 'Unknown error'));
                } else {
                    await message.reply('❌ Could not download from TikTok. Error: ' + (error.message || 'Unknown error'));
                }
                return { success: false, message: 'TikTok download failed: ' + (error.message || 'Unknown error') };
            }
        } else if (/soundcloud\.com/.test(downloadLink)) {
            message.react('🔽').catch()
            const sanitizedLink = downloadLink.split('?')[0];
            const result = await downloadSoundCloud(message, sanitizedLink, randomName, rnd5dig, identifierName, useIdentifier);
            return result.success 
                ? { success: true, title: result.videoTitle }
                : { success: false, message: result.message };
        } else if (/spotify\.com/.test(downloadLink)) {
            message.react('🔽').catch()
            const result = await downloadSpotify(message, downloadLink, randomName, rnd5dig, identifierName, useIdentifier);
            return result.success 
                ? { success: true, title: result.videoTitle }
                : { success: false, message: result.message };
        } else {
            return { success: false, message: 'URL you provided is currently not supported' };
        }
    } catch (error) {
        console.error('Error downloading:', error);
        return { success: false };
    }
}

module.exports = { downloadURL };