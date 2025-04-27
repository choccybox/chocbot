const axios = require('axios');
const fs = require('fs');
const { twitter, igdl, ttdl } = require('btch-downloader');
const ffmpeg = require('fluent-ffmpeg');
const SoundCloud = require("soundcloud-scraper");
const NodeID3 = require('node-id3');
const path = require('path');
const client = new SoundCloud.Client();
let spotify;
async function initSpotify() {
    const { default: Spotify } = await import('@zaptyp/spotifydl-core');
    const SpotCreds = {
        clientId: process.env.SPOTIFY_CLIENT_ID,
        clientSecret: process.env.SPOTIFY_CLIENT_SECRET
    };
    spotify = new Spotify(SpotCreds);
}
initSpotify();

async function downloadYoutube(message, downloadLink, randomName, rnd5dig, identifierName, convertArg, isMusic, useIdentifier) {
    return new Promise(async (resolve, reject) => {
        try {
            console.log('Downloading from YouTube:', downloadLink);
            console.log('Convert argument:', convertArg);
            // Set download mode based on convertArg or if it's from music.youtube
            const downloadMode = (convertArg || isMusic) ? 'audio' : 'auto';
            
            // Make POST request to Cobalt API
            const response = await axios({
                method: 'POST',
                url: 'https://ytapi.chocbox.org/',
                data: {
                    url: downloadLink,
                    videoQuality: '1080',
                    audioFormat: 'mp3',
                    filenameStyle: 'basic',
                    downloadMode: downloadMode,
                    youtubeDubLang: 'en',
                    youtubeVideoCodec: 'h264'
                },
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });
            
            // Check for valid response
            if (!response.data || !response.data.status) {
                throw new Error('Invalid response from Cobalt API');
            }
            
            // Handle different response types
            let downloadURL, filename;
            
            if (response.data.status === 'redirect' || response.data.status === 'tunnel') {
                downloadURL = response.data.url;
                filename = response.data.filename;
                console.log(`Got ${response.data.status} response with filename: ${filename}`);
            } 
            else if (response.data.status === 'picker' && response.data.picker?.length > 0) {
                downloadURL = response.data.picker[0].url;
                console.log('Using first item from picker response');
            }
            else if (response.data.status === 'error') {
                throw new Error(`API error: ${response.data.error?.code || 'unknown'}`);
            }
            else {
                throw new Error(`Unexpected response status: ${response.data.status}`);
            }
            
            if (!downloadURL) {
                throw new Error('No download URL found in response');
            }
            
            // Sanitize filename
            const sanitizedTitle = filename
                .replace(/\(\s*\d{3,4}\s*,\s*h\d{3,4}\s*\)/gi, '') // Remove (1080, h264) or (720, h265)
                .replace(/[^a-zA-Z0-9 \-_.]/g, '') // Remove non-English, hashtags, exclamation marks, etc.
                .replace(/\.mp[34]$/i, '') // Remove .mp3 or .mp4 extension at end
                .trim()
                .split(' ').slice(0, 8).join(' ') // Keep only first 8 words
                .toLowerCase()
                .slice(0, 200);

            // Always use mp4 extension since we're always downloading videos
            const fileExt = (convertArg || isMusic) ? 'mp3' : 'mp4';
            const outputFile = `temp/${sanitizedTitle}.${fileExt}`;

            // Create temp directory if needed
            fs.mkdirSync('temp', { recursive: true });

            // Download the file
            console.log(`Downloading to ${outputFile}`);
            const fileResponse = await axios({
                method: 'get',
                url: downloadURL,
                responseType: 'stream'
            });
            
            // Write to file
            const writer = fs.createWriteStream(outputFile);
            fileResponse.data.pipe(writer);
            
            await new Promise((resolveDownload, rejectDownload) => {
                writer.on('finish', resolveDownload);
                writer.on('error', rejectDownload);
            });
            
            console.log('Download complete');

            console.log('using identifier:', useIdentifier);

            // if useIdentifier is true, rename the file
            if (useIdentifier) {
                const newFileName = `temp/${randomName}-${identifierName}-${rnd5dig}.${fileExt}`;
                fs.renameSync(outputFile, newFileName);
                console.log(`Renamed file to ${newFileName}`);
            }
            
            resolve({
                success: true,
                filename: outputFile,
                videoTitle: sanitizedTitle
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
            const song = await client.getSongInfo(sanitizedLink);

            // Use SoundCloud info for search, but not for tags
            const searchTitle = song.title || '';
            const searchArtist = song.author?.name.split('/')[0].trim() || song.user?.name.split('/')[0].trim() || '';

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
                /* console.log('MusicBrainz response:', mbResponse.data.recordings[0].releases); */
                if (recordings && recordings.length > 0) {
                    const rec = recordings[0];
                    mbData = {
                        artist: rec['artist-credit'] && rec['artist-credit'][0]?.name ? rec['artist-credit'][0].name : searchArtist,
                        album_artist: rec['artist-credit'] && rec['artist-credit'][0]?.name ? rec['artist-credit'][0].name : searchArtist,
                        year: rec['first-release-date'] ? rec['first-release-date'].split('-')[0] : '',
                        /* genre: rec.tags && rec.tags.length > 0 ? rec.tags.map(t => t.name).join(', ') : '', */
                        album: rec.releases && rec.releases.length > 0 ? rec.releases[0].title : '',
                        cover: song.thumbnail,
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
                    cover_image: song.artworkURL || song.thumbnail
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
                : `temp/${searchTitle}.mp3`;

            // Download the song
            const stream = await song.downloadProgressive();
            const writer = stream.pipe(fs.createWriteStream(fileName));

            writer.on("finish", async () => {
                console.log("Finished writing song!");

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
                    isUnder10MB: song.size < 10 * 1024 * 1024 // Check if the file is under 10 MB
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
            const song = await spotify.getTrack(downloadLink);
            console.log('song:', song);

            let tags = {
                title: song.name || '',
                artist: Array.isArray(song.artists) && song.artists.length > 0 ? song.artists[0] : '',
                album_artist: Array.isArray(song.artists) && song.artists.length > 0 ? song.artists[0] : '',
                album: song.album_name || '',
                year: song.release_date.split('-')[0] || '',
                trackNumber: '',
                APIC: undefined,
                TRCK: undefined
            };

            // Query MusicBrainz for metadata
            let mbData = {};
            try {
                // Search MusicBrainz for the song title and artist
                console.log('Searching MusicBrainz for:', tags.title, tags.artist);
                const mbSearchUrl = `https://musicbrainz.org/ws/2/recording/?query=recording:"${encodeURIComponent(tags.title)}"%20AND%20artist:"${encodeURIComponent(tags.artist)}"&fmt=json&limit=1`;
                const mbResponse = await axios.get(mbSearchUrl, { headers: { 'User-Agent': 'chocbot/1.0 ( https://github.com/choccybox/chocbot )' } });
                const recordings = mbResponse.data.recordings;
                /* console.log('MusicBrainz response:', mbResponse.data.recordings[0].releases); */
                if (recordings && recordings.length > 0) {
                    const rec = recordings[0];
                    mbData = {
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

            // Fill tags from MusicBrainz if available
            tags.artist = tags.artist;
            tags.TPE2 = tags.album_artist;
            tags.year = tags.year;
            tags.album = tags.album;
            tags.TRCK = mbData.TRCK;

            const fileName = useIdentifier
                ? `temp/${randomName}-${identifierName}-${rnd5dig}.mp3`
                : `temp/${song.name}.mp3`;

            // Download the song as a buffer
            const songBuffer = await spotify.downloadTrack(downloadLink, tags.name);

            fs.writeFileSync(fileName, songBuffer);

            // Download and crop album art if available
            const coverUrl = song.cover_url;
            if (coverUrl) {
                try {
                    // Download the cover image
                    const response = await axios.get(coverUrl, { responseType: 'arraybuffer' });
                    const safeTitle = (tags.title || 'cover').replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 32) || 'cover';
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
                videoTitle: song.name || fileName,
                isUnder10MB: song.size < 10 * 1024 * 1024 // Check if the file is under 10 MB
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
                return { success: true, title: result.videoTitle };
            } else {
                const result = await downloadYoutube(message, downloadLink, randomName, rnd5dig, identifierName, convertArg, isMusic = false, useIdentifier);
                return { success: true, title: result.videoTitle };
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
            const title = `${data.title || `twitter_video_${randomName}_${rnd5dig}`}` // use title if available, otherwise use default
                .replace(/https?:\/\/\S+/gi, '') // remove URLs
                .split(' ').slice(0, 6).join(' ') // get first 6 words
                .replace(/\s+/g, '_') // replace spaces with underscores
                .toLowerCase()
                .slice(0, 200); // limit length
            
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
            const title = `${data.title || `tiktok_video_${randomName}_${rnd5dig}`}` // use title if available, otherwise use default
                .replace(/https?:\/\/\S+/gi, '')  // remove URLs
                .replace(/[\u{1F600}-\u{1F6FF}\u{2600}-\u{27BF}]/gu, '')  // remove emojis
                .replace(/#\w+\s*/g, '')  // remove hashtags
                .split(' ').slice(0, 6).join(' ')  // limit to 6 words
                .replace(/\s+/g, '_') // replace spaces with underscores
                .toLowerCase()
                .trim().slice(0, 50);  // limit length
            
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
            // sanitize link to remove everything after the first ?
            const sanitizedLink = downloadLink.split('?')[0];
            const result = await downloadSoundCloud(message, sanitizedLink, randomName, rnd5dig, identifierName, useIdentifier);
            return { success: true, title: result.videoTitle };
        } else if (/spotify\.com/.test(downloadLink)) {
            message.react('🔽').catch()
            const result = await downloadSpotify(message, downloadLink, randomName, rnd5dig, identifierName);
            return { success: true, title: result.videoTitle };
        } else {
            throw new Error('Unsupported URL');
        }
    } catch (error) {
        console.error('Error downloading:', error);
        return { success: false };
    }
}

module.exports = { downloadURL };