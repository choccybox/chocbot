const axios = require('axios');
const fs = require('fs');
const { twitter, igdl, ttdl } = require('btch-downloader');
const ffmpeg = require('fluent-ffmpeg');
const https = require('https');
const { spawn } = require('child_process');

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
        }  else if (/tiktok\.com/.test(downloadLink)) {
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
        } else {
            throw new Error('Unsupported URL');
        }
    } catch (error) {
        console.error('Error downloading:', error);
        return { success: false };
    }
}

module.exports = { downloadURL };