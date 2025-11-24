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
const ytdl = require('ytdl-core');
scdl.setClientID(process.env.SOUNDCLOUD_CLIENT_ID);

async function downloadYoutube(_message, downloadLink, randomName, rnd5dig, identifierName, convertArg, _isMusic, useIdentifier) {
    return new Promise(async (resolve, reject) => {
        try {
            console.log('Downloading from YouTube using ytdl-core:', downloadLink);

            let infoData;
            try {
                infoData = await ytdl.getInfo(downloadLink);
            } catch (metadataErr) {
                console.warn('Could not fetch YouTube metadata:', metadataErr.message);
                return reject(metadataErr);
            }

            const titleUrl = infoData.videoDetails.title || `${randomName}_YT_${rnd5dig}`;
            const thumbnailUrl = infoData.videoDetails.thumbnails?.[infoData.videoDetails.thumbnails.length - 1]?.url || null;

            const title = sanitize(titleUrl, { replacement: '_' })
                .replace(/[^\w\s-]/g, '')
                .replace(/\s+/g, '_')
                .toLowerCase()
                .trim()
                .slice(0, 200);

            const extension = convertArg ? 'mp4' : 'mp4';
            const tempFileName = useIdentifier
                ? `temp/${randomName}-${identifierName}-${rnd5dig}_temp.${extension}`
                : `temp/${title}_temp.${extension}`;
            
            const finalFileName = useIdentifier
                ? `temp/${randomName}-${identifierName}-${rnd5dig}.${convertArg ? 'mp3' : 'mp4'}`
                : `temp/${title}.${convertArg ? 'mp3' : 'mp4'}`;

            const format = convertArg 
                ? ytdl.chooseFormat(infoData.formats, { quality: 'highestaudio', filter: 'audioonly' })
                : ytdl.chooseFormat(infoData.formats, { quality: 'highest', filter: format => format.hasVideo && format.hasAudio });

            const videoStream = ytdl.downloadFromInfo(infoData, { format });
            const writeStream = fs.createWriteStream(tempFileName);
            
            videoStream.pipe(writeStream);

            await new Promise((res, rej) => {
                writeStream.on('finish', res);
                writeStream.on('error', rej);
            });

            if (convertArg) {
                await convertToMP3(tempFileName, finalFileName);

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
                    NodeID3.write(tags, finalFileName);
                    console.log('ID3 tags written');
                } catch (e) {
                    console.warn('Failed to write ID3 tags:', e.message);
                }
            } else {
                fs.renameSync(tempFileName, finalFileName);
            }

            resolve({
                success: true,
                filename: finalFileName,
                videoTitle: title
            });

        } catch (err) {
            console.error('Download error:', err.message);
            reject(err);
        }
    });
}

async function downloadSoundCloud(message, sanitizedLink, randomName, rnd5dig, identifierName, useIdentifier) {
    return new Promise(async (resolve, reject) => {
        try {
            console.log('Downloading from SoundCloud:', sanitizedLink);

            // if link includes "sets", use soundcloud-scraper to get playlist tracks
            if (sanitizedLink.includes('/sets/')) {
                try {
                    const playlist = await client.getPlaylist(sanitizedLink);
                    console.log('SoundCloud playlist info:', playlist);
                    console.log('Number of tracks:', playlist.tracks?.length || 0);
                    
                    if (!playlist.tracks || playlist.tracks.length === 0) {
                        reject(new Error('Playlist is empty or could not be fetched.'));
                        return;
                    }

                    const playlistTitle = sanitize(playlist.title || `soundcloud_playlist_${rnd5dig}`, { replacement: '_' }).replace(/\s+/g, '_').slice(0, 100);
                    const playlistDir = path.join('temp', playlistTitle);
                    
                    // Create directory for playlist
                    if (!fs.existsSync(playlistDir)) {
                        fs.mkdirSync(playlistDir, { recursive: true });
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
                    
                    resolve({
                        success: true,
                        videoTitle: playlistTitle,
                        filename: zipPath,
                        isPlaylist: true
                    });
                    
                } catch (err) {
                    console.error('Error fetching SoundCloud playlist info:', err.message);
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

                resolve({
                    success: true,
                    videoTitle: searchTitle || fileName,
                    filename: fileName,
                    isUnder10MB: fileSizeInBytes < 10 * 1024 * 1024 // Check if the file is under 10 MB
                });
            });

            writer.on("error", (err) => {
                console.error('Write error:', err.message);
                reject(err);
            });

        } catch (err) {
            console.error('Download error:', err.message);
            reject(err);
        }
    });
}

async function downloadSpotify(message, downloadLink, randomName, rnd5dig, identifierName, useIdentifier) {
    return new Promise(async (resolve, reject) => {
        try {
            console.log('Downloading from Spotify:', downloadLink);
            
            // Extract Spotify track ID from URL
            let trackId;
            if (downloadLink.includes('/track/')) {
                trackId = downloadLink.split('/track/')[1].split('?')[0];
            } else {
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
                return resolve({ success: false, message: 'Could not find a YouTube equivalent for this Spotify track' });
            }
            
            console.log('Found YouTube URL:', youtubeUrl);
            
            // Use downloadYoutube to download the video as MP3
            return downloadYoutube(message, youtubeUrl, randomName, rnd5dig, identifierName, true, true, useIdentifier).then(result => {
                resolve({
                    success: true,
                    filename: result.filename,
                    videoTitle: result.videoTitle
                });
            });
            
        } catch (err) {
            console.error('Spotify download error:', err.message);
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
            message.react('🔽').catch();
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
                return { success: false, message: `couldn't find a video or it's marked as NSFW.` };
            }
            const response = await axios({
                method: 'get',
                url: downloadUrl,
                responseType: 'stream'
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
        } else if (/instagram\.com/.test(downloadLink)) {
            message.react('🔽').catch();
            const data = await igdl(downloadLink);
            const downloadUrl = data[0].url;
            console.log(data);
            if (!downloadUrl) {
                return { success: false, message: `couldn't find a video or it's marked as private.` };
            }
            const response = await axios({
                method: 'get',
                url: downloadUrl,
                responseType: 'stream'
            });
            console.log('using identifier:', useIdentifier);
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
        } else if (/tiktok\.com/.test(downloadLink)) {
            message.react('🔽').catch();
            const data = await ttdl(downloadLink);
            const downloadUrl = data.video[0];
            console.log(data);
            if (!downloadUrl) {
                return { success: false, message: `couldn't find the video` };
            }
            const response = await axios({
                method: 'get',
                url: downloadUrl,
                responseType: 'stream'
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