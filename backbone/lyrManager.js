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
                
                /* if (!titleMatchesInput) {
                    console.log('Title mismatch. Input:', initialSong, 'Genius result:', topResult.title);
                    console.log('Assuming no lyrics available for this song.');
                    return {
                        song: initialSong,
                        artist: initialArtist,
                        url: null,
                        lyrics: null,
                        image: null,
                    };
                } */
                
                const lyricsPageResponse = await axios.get(topResult.url);
                
                const lyricsContainerRegex = /<div[^>]*data-lyrics-container="true"[^>]*>[\s\S]*?<p>[\s\S]*?<\/p>[\s\S]*?<\/div>/;
                let lyricsContainerMatch = lyricsPageResponse.data.match(lyricsContainerRegex);
                
                // If no match found with the initial regex, try different patterns
                if (!lyricsContainerMatch) {
                    // Try alternative regex patterns
                    const alternativeRegexes = [
                        /<div[^>]*class="[^"]*Lyrics__Container[^"]*"[^>]*>[\s\S]*?<\/div>/,
                        /<div[^>]*data-lyrics-container="true"[^>]*>[\s\S]*?<\/div>/,
                        /<div[^>]*class="lyrics"[^>]*>[\s\S]*?<\/div>/
                    ];
                    
                    for (const regex of alternativeRegexes) {
                        lyricsContainerMatch = lyricsPageResponse.data.match(regex);
                        if (lyricsContainerMatch) break;
                    }
                }

                // If we found lyrics, clean them up without removing content
                if (lyricsContainerMatch && lyricsContainerMatch[0]) {
                    // Remove the form section containing the "How to Format Lyrics" instructions
                    lyricsContainerMatch[0] = lyricsContainerMatch[0].replace(
                        /<form[\s\S]*?<p>How to Format Lyrics:[\s\S]*?<\/form>/gi, 
                        ''
                    );
                    
                    // Remove annotations with font-weight="light" attribute
                    lyricsContainerMatch[0] = lyricsContainerMatch[0].replace(
                        /<a\s+font-weight="light"[^>]*>[\s\S]*?<\/a>/gi,
                        ''
                    );
                    
                    // Language selector links
                    lyricsContainerMatch[0] = lyricsContainerMatch[0].replace(
                        /<li><a href="https:\/\/genius\.com\/.*?-lyrics"[^>]*><div>.*?<\/div><\/a><\/li>/gi,
                        ''
                    );
                    
                    // Remove SVG elements
                    lyricsContainerMatch[0] = lyricsContainerMatch[0].replace(
                        /<svg[\s\S]*?<\/svg>/gi,
                        ''
                    );
                    
                    // Remove other non-lyric elements
                    const nonLyricsElements = [
                        /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
                        /<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi,
                        /<button[^>]*>.*?<\/button>/gi,
                        /<iframe[^>]*>.*?<\/iframe>/gi,
                        /<aside[^>]*>.*?<\/aside>/gi,
                        /<form[^>]*>[\s\S]*?<\/form>/gi,  // More aggressive form removal
                        /<h2[^>]*>.*?<\/h2>/gi,  // Remove h2 elements
                        /<ul[^>]*class="[^"]*translations[^"]*"[^>]*>[\s\S]*?<\/ul>/gi // Remove translation lists
                    ];
                    
                    // Only remove elements that are definitely not lyrics
                    nonLyricsElements.forEach(regex => {
                        lyricsContainerMatch[0] = lyricsContainerMatch[0].replace(regex, '');
                    });
                    
                    // Remove empty nested div elements
                    let prevContent = '';
                    let currentContent = lyricsContainerMatch[0];
                    
                    // Keep replacing empty divs until no more changes are made
                    while (prevContent !== currentContent) {
                        prevContent = currentContent;
                        currentContent = currentContent.replace(/<div[^>]*>\s*(<div[^>]*>\s*<\/div>\s*)*<\/div>/g, '');
                    }
                    
                    lyricsContainerMatch[0] = currentContent;
                    
                    // Add <br><br> between divs that contain text
                    lyricsContainerMatch[0] = lyricsContainerMatch[0].replace(/<\/div>\s*<div[^>]*>/gi, '</div><br><div>');
                    
                    // Preserve all text content inside the lyrics container
                    // but clean up any obvious inline ads or non-lyric elements
                    lyricsContainerMatch[0] = lyricsContainerMatch[0]
                        .replace(/class="[^"]*"/g, '')  // Remove class attributes
                        .replace(/id="[^"]*"/g, '')     // Remove id attributes
                        .replace(/style="[^"]*"/g, '')  // Remove style attributes
                        .replace(/data-[^=]*="[^"]*"/g, ''); // Remove data attributes
                }

                fs.writeFileSync('lyricsContainerMatch.html', lyricsContainerMatch[0]);
                
                console.log('Found lyrics container:', !!lyricsContainerMatch);
                
                let extractedLyrics = null;
                
                if (lyricsContainerMatch && lyricsContainerMatch[0]) {
                    // Process the entire lyrics container
                    let htmlContent = lyricsContainerMatch[0];
                    
                    // Remove annotations with font-weight attribute (explanatory notes)
                    htmlContent = htmlContent.replace(
                        /<[^>]*font-weight="[^"]*"[^>]*>[\s\S]*?<\/[^>]*>/gi,
                        ''
                    );
                    
                    // Remove all translation links (not just Russian)
                    htmlContent = htmlContent.replace(
                        /<li><a href="https:\/\/genius\.com\/.*?-lyrics"[^>]*>.*?<\/a><\/li>/gi,
                        ''
                    );
                    
                    // Remove any divs/uls containing translation links or language references
                    htmlContent = htmlContent.replace(
                        /<div[^>]*>(?:[\s\S]*?(?:translation|español|русский|français|deutsch|italiano|português|日本語|한국어|中文)[\s\S]*?)<\/div>/gi,
                        ''
                    );
                    
                    // Remove language selector links and sections
                    htmlContent = htmlContent.replace(
                        /<ul[^>]*class="[^"]*(?:translations|languages)[^"]*"[^>]*>[\s\S]*?<\/ul>/gi,
                        ''
                    );
                    
                    // Remove all URLs from the text content
                    htmlContent = htmlContent.replace(
                        /https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&\/=]*)/gi,
                        ''
                    );
                    
                    // Convert <br> tags to newlines
                    htmlContent = htmlContent.replace(/<br\s*\/?>/gi, '\n');
                    
                    // Replace closing/opening divs with additional newlines
                    htmlContent = htmlContent.replace(/<\/div>\s*<div[^>]*>/gi, '\n\n');
                    
                    // Remove all HTML tags but preserve their content
                    htmlContent = htmlContent.replace(/<[^>]*>/g, '');
                    
                    // Fix HTML entities
                    extractedLyrics = htmlContent
                        .replace(/&amp;/g, '&')
                        .replace(/&lt;/g, '<')
                        .replace(/&gt;/g, '>')
                        .replace(/&quot;/g, '"')
                        .replace(/&apos;/g, "'")
                        .replace(/&#x27;/g, "'")
                        .replace(/\n{3,}/g, '\n\n') // Replace multiple newlines with just two
                        .trim();
                    
                    // Ignore text starting with "How to Format Lyrics" and everything after it
                    const formatIndex = extractedLyrics.indexOf("How to Format Lyrics");
                    if (formatIndex !== -1) {
                        extractedLyrics = extractedLyrics.substring(0, formatIndex).trim();
                    }
                        
                    topResult.extractedLyrics = extractedLyrics;
                    console.log('Successfully extracted lyrics');
                }
                
                console.log('Extracted lyrics:', topResult.extractedLyrics ? 'Found' : 'Not found');
               
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