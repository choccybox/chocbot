const axios = require('axios');
const fs = require('fs');
const { twitter, igdl, ttdl } = require('btch-downloader');
const ffmpeg = require('fluent-ffmpeg');
const SoundCloud = require("soundcloud-scraper");
const NodeID3 = require('node-id3');
const path = require('path');
const sanitize = require('sanitize-filename');
const client = new SoundCloud.Client();
const SpotifyToYoutubeMusic = require('spotify-to-ytmusic');

async function downloadYoutube(_message, downloadLink, randomName, rnd5dig, identifierName, convertArg, _isMusic, useIdentifier) {
    return new Promise(async (resolve, reject) => {
        try {
            console.log('Downloading from YouTube using oceansaver API:', downloadLink);
            
            // Make initial API call with retry logic
            let response;
            let retries = 3;
            while (retries > 0) {
                try {
                    // Choose format based on convertArg
                    const format = convertArg ? 'mp3' : '1080';
                    response = await axios.get(`https://p.oceansaver.in/ajax/download.php?format=${format}&url=${downloadLink}`, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                            'Accept': 'application/json, text/plain, */*',
                            'Accept-Language': 'en-US,en;q=0.9',
                            'Accept-Encoding': 'gzip, deflate, br',
                            'Origin': 'https://p.oceansaver.in',
                            'Referer': 'https://p.oceansaver.in/',
                            'Sec-Fetch-Dest': 'empty',
                            'Sec-Fetch-Mode': 'cors',
                            'Sec-Fetch-Site': 'same-origin',
                            'Connection': 'keep-alive'
                        }
                    });
                    break;
                } catch (error) {
                    if (error.response && error.response.status === 400 && retries > 1) {
                        console.log('Received 400 error, retrying in 3s...');
                        await new Promise(resolve => setTimeout(resolve, 3000));
                        retries--;
                        continue;
                    }
                    throw error;
                }
            }

            console.log('Initial API response:', response.data);

            // Poll progress URL until download is ready
            const progressUrl = response.data.progress_url;
            const title = sanitize((response.data.title || `${randomName}_YT_${rnd5dig}`), {
                replacement: '_'
            })
            .replace(/[^\w\s-]/g, '')
            .replace(/\s+/g, '_')
            .toLowerCase()
            .trim()
            .slice(0, 200);
            let downloadUrl = null;
            const thumbnailUrl = response.data.info.image;
            const titleUrl = response.data.info.title;

            while (!downloadUrl) {
                let progressResponse;
                retries = 3;
                while (retries > 0) {
                    try {
                        progressResponse = await axios.get(progressUrl, {
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                                'Accept': 'application/json, text/plain, */*',
                                'Accept-Language': 'en-US,en;q=0.9',
                                'Accept-Encoding': 'gzip, deflate, br',
                                'Origin': 'https://p.oceansaver.in',
                                'Referer': 'https://p.oceansaver.in/',
                                'Sec-Fetch-Dest': 'empty',
                                'Sec-Fetch-Mode': 'cors',
                                'Sec-Fetch-Site': 'same-origin',
                                'Connection': 'keep-alive'
                            }
                        });
                        break;
                    } catch (error) {
                        if (error.response && error.response.status === 400 && retries > 1) {
                            console.log('Received 400 error during progress check, retrying in 3s...');
                            await new Promise(resolve => setTimeout(resolve, 3000));
                            retries--;
                            continue;
                        }
                        throw error;
                    }
                }

                if (progressResponse.data.success === 1 && progressResponse.data.progress === 1000) {
                    downloadUrl = progressResponse.data.download_url;
                    break;
                }
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            // Download the file with retry logic
            let fileResponse;
            retries = 3;
            while (retries > 0) {
                try {
                    fileResponse = await axios({
                        method: 'get',
                        url: downloadUrl,
                        responseType: 'stream'
                    });
                    break;
                } catch (error) {
                    if (error.response && error.response.status === 400 && retries > 1) {
                        console.log('Received 400 error during file download, retrying in 3s...');
                        await new Promise(resolve => setTimeout(resolve, 3000));
                        retries--;
                        continue;
                    }
                    throw error;
                }
            }

            const extension = convertArg ? 'mp3' : 'mp4';
            const fileName = useIdentifier 
                ? `temp/${randomName}-${identifierName}-${rnd5dig}.${extension}`
                : `temp/${title}.${extension}`;

            const writer = fs.createWriteStream(fileName);
            fileResponse.data.pipe(writer);

            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });

            // Only add tags if it's an mp3 file
            if (convertArg) {
                // Initialize tags object
                let tags = {
                    title: titleUrl || '',
                    artist: '',
                    album: '',
                    year: '',
                    genre: ''
                };
                
                // Download and crop YouTube thumbnail for album art
                if (thumbnailUrl) {
                    try {
                        // Download the cover image
                        const response = await axios.get(thumbnailUrl, { responseType: 'arraybuffer' });
                        const safeTitle = titleUrl.replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 32) || 'cover';
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
                        // Calculate size with 25% zoom (75% of original size)
                        const size = Math.min(dimensions.width, dimensions.height) * 0.75;
                        // Calculate center point for cropping
                        const x = (dimensions.width - size) / 2;
                        const y = (dimensions.height - size) / 2;
                        const croppedCoverPath = path.join('temp', `${safeTitle}_cover_cropped.jpg`);

                        // Crop the image into a square using ffmpeg with zoom effect
                        await new Promise((res, rej) => {
                            ffmpeg(coverPath)
                                .outputOptions([`-vf crop=${size}:${size}:${x}:${y}`])
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
            }

            resolve({
                success: true,
                filename: fileName,
                videoTitle: title,
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
            const sanitizedLink = downloadLink.split('?')[0];
            const result = await downloadSoundCloud(message, sanitizedLink, randomName, rnd5dig, identifierName, useIdentifier);
            return result.success 
                ? { success: true, title: result.videoTitle }
                : { success: false, message: result.message };
        }else if (/spotify\.com/.test(downloadLink)) {
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