const axios = require('axios');
const fs = require('fs');
const genius = require("genius-lyrics");
const getMetadata = require('youtube-metadata-from-url');
const geniusClient = new genius.Client(process.env.GENIUS_TOKEN);
const spotifySearch = require('isomorphic-unfetch')
const soundCloud = require("soundcloud-scraper");
const soundCloudClient = new soundCloud.Client();
const { getAverageColor } = require('fast-average-color-node');
const https = require('https');
const dotenv = require('dotenv');
dotenv.config();

async function searchForLyrics(message, searchLink) {
    try {
        if (/youtube\.com|youtu\.be|music\.youtube\.com/.test(searchLink)) {
            if (searchLink.includes('music.youtube.com')) {
                searchLink = searchLink.replace('music.', '');
            }
            // First install the package: npm install youtube-metadata-from-url
            return new Promise((resolve, reject) => {
                (async () => {
                    try {
                        // Only fetch basic metadata (title and channel)
                        const metadata = await getMetadata.metadata(searchLink);                        
                        const song = metadata.title;
                        const artist = metadata.author_name.replace(" - Topic", "");
                        console.log('YouTube video info:', song, artist);
                        const result = await GeniusResult(song, artist);
                        resolve(result);
                    } catch (err) {
                        console.error('Error fetching video info:', err);
                        reject(err);
                    }
                })();
            });
        } else if (/spotify\.com|open\.spotify\.com/.test(searchLink)) {
            return new Promise((resolve, reject) => {
                (async () => {
                    try {
                        const { getData } = require('spotify-url-info')(spotifySearch)
                        const data = await getData(searchLink, {
                            headers: {
                                'user-agent': 'googlebot'
                            }
                        });
                        console.log(data);
                        const song = data.title;
                        const artist = data.artists[0].name;
                        const result = await GeniusResult(song, artist);
                        resolve(result);
                    } catch (err) {
                        console.error('Error fetching video info:', err);
                        reject(err);
                    }
                })();
            });
        } else if (/soundcloud\.com/.test(searchLink)) {
            return new Promise((resolve, reject) => {
            (async () => {
                try {
                    searchLink = searchLink.split('?')[0];
                    const searchSong = await soundCloudClient.getSongInfo(searchLink);
                    const song = searchSong.title;
                    const artist = searchSong.author.name;
                    const result = await GeniusResult(song, artist);
                    resolve(result);
                } catch (err) {
                    console.error('Error fetching song info:', err);
                    reject(err);
                }
            })();
            });
        } else {
            throw new Error('Unsupported URL');
        }
    } catch (error) {
        console.error('Error downloading:', error);
        return { success: false };
    }
}

async function GeniusSearch(song, artist) {
    try {
        // console.log('Input:', song, artist);
        
        // First, fetch song data from Genius API
        const searchResponse = await axios.get('https://api.genius.com/search', {
            params: {
                q: `${song} ${artist}`,
            },
            headers: {
                'Authorization': `Bearer ${process.env.GENIUS_TOKEN}`
            }
        });
        
        // Get only the first search result
        const searchResults = searchResponse.data.response.hits.length > 0 
            ? [{
                title: searchResponse.data.response.hits[0].result.title,
                artist: searchResponse.data.response.hits[0].result.primary_artist.name,
                url: searchResponse.data.response.hits[0].result.url,
                image: searchResponse.data.response.hits[0].result.header_image_thumbnail_url
              }]
            : [];

        console.log('Genius Search Results:', searchResults);
        
        // Store the initial input for fallback
        const initialSong = song;
        const initialArtist = artist;
        
        // If we have results and need lyrics, fetch the actual page to extract them
        if (searchResults.length > 0) {
            try {
                console.log('Search results available:', searchResults.length);
                
                // Get HTML from the lyrics page
                const topResult = searchResults[0];
                console.log('Fetching lyrics from URL:', topResult.url);
                
                // Check if extracted title matches input title
                const titleMatchesInput = 
                    initialSong.toLowerCase().includes(topResult.title.toLowerCase()) ||
                    topResult.title.toLowerCase().includes(initialSong.toLowerCase());
                
                if (!titleMatchesInput) {
                    console.log('Title mismatch. Input:', initialSong, 'Genius result:', topResult.title);
                    console.log('Assuming no lyrics available for this song.');
                    return {
                        song: initialSong,
                        artist: initialArtist,
                        url: null,
                        lyrics: null,
                        image: null,
                    };
                }
                
                const lyricsPageResponse = await axios.get(topResult.url);
                console.log('Lyrics page response status:', lyricsPageResponse.status);
                console.log('Lyrics page response length:', lyricsPageResponse.data.length);
                
                // Use a regex to extract lyrics from divs with data-lyrics-container attribute
                const lyricsRegex = /<div data-lyrics-container="true"[^>]*>([\s\S]*?)<\/div>/g;
                console.log('Using regex pattern:', lyricsRegex);
                
                const matches = [...lyricsPageResponse.data.matchAll(lyricsRegex)];
                console.log('Regex matches found:', matches.length);
                
                if (matches.length > 0) {
                    // Store lyrics in the top result for use later                
                    topResult.extractedLyrics = matches.map(m => m[1]).join('\n')
                    .replace(/<br\s*\/?>/g, '\n')  // Replace <br> with newlines
                    .replace(/<[^>]*>/g, '')       // Remove all HTML tags
                    // Decode HTML entities
                    .replace(/&amp;/g, '&')
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .replace(/&quot;/g, '"')
                    .replace(/&#x27;/g, "'")
                    .replace(/&#039;/g, "'")
                    .replace(/&#x2F;/g, "/")
                    .replace(/&nbsp;/g, ' ');
                    
                    console.log('Extracted lyrics:', topResult.extractedLyrics);
                } else {
                    console.log('No lyrics matches found in the HTML');
                }
            } catch (error) {
                console.error('Error extracting lyrics:', error);
                console.log('Error details:', error.message);
                if (error.response) {
                    console.log('Error response:', error.response.status, error.response.statusText);
                }
            }
        } else {
            console.log('No search results to extract lyrics from');
        }
        // If we have search results, use the top result
        if (searchResults.length > 0) {
            // Sort by score (from Genius) if available
            searchResults.sort((a, b) => b.score - a.score);
            const topResult = searchResults[0];

            return {
                song: topResult.title,
                artist: topResult.artist,
                url: topResult.url,
                lyrics: topResult.extractedLyrics || null,
                image: topResult.image || null,
                artistUrl: `https://genius.com/artists/${encodeURIComponent(topResult.artist.replace(/ /g, '-'))}`,
                properMoreFrom: `More from [${topResult.artist}](https://genius.com/artists/${encodeURIComponent(topResult.artist.replace(/ /g, '-'))})` || null,
            };
        } else {
            // If no results, return the initial parsed values
            console.log('No search results found, using parsed input.');
            return {
                song: initialSong,
                artist: initialArtist
            };
        }
    } catch (error) {
        console.error('Error searching for song info:', error);
        
        // Fallback to basic string splitting
        let inputParts = nameAndArtist.split(' - ');
        let artist = inputParts[0] || nameAndArtist;
        let song = inputParts[1] || '';
        
        return { song, artist };
    }
}

async function GeniusResult(song, artist) {
    console.log('GeniusResult:', song, artist);
    // Get search results
    const result = await GeniusSearch(song, artist);
    console.log('GeniusSearch result:', result);
    
    // Extract data from result
    const resultSong = result.song || song;
    const resultArtist = result.artist || artist;
    const resultLyrics = result.lyrics || "No lyrics found";
    const resultImage = result.image;
    const trackURL = result.url || "";
    const artistURL = result.artistUrl || "";
    const fullTitle = `${resultSong} by ${resultArtist}`;
    const properMoreFrom = result.properMoreFrom || "";
    
    // Get color from image
    let embedColor = '#ff0000';
    try {
        if (resultImage) {
            const color = await getAverageColor(resultImage);
            embedColor = color.hex;
        }
    } catch (error) {
        console.error('Error getting average color:', error);
    }
    
    // Format lyrics if they exist
    let properLyrics = resultLyrics;
    if (properLyrics) {
        properLyrics = properLyrics.replace(/\[(.*?)\]/g, (match, p1) => {
            return `**[${p1}]**`;
        });
    } else {
        properLyrics = "No lyrics or instrumental";
    }
    
    const properProvider = result.lyrics ? 'Lyrics and Art provided by Genius, not affiliated' : ' ';
    
    return {
        success: true,
        properLyrics,
        trackURL,
        artistURL,
        fullTitle,
        artist: resultArtist,
        properImage: resultImage,
        properProvider,
        properMoreFrom,
        embedColor
    };
}

module.exports = { searchForLyrics };