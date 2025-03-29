const altnames = ['toimage', 'toimg', '2img', '2image'];
const quickdesc = 'Converts all video frames/first frame to image/s';

const dotenv = require('dotenv');
dotenv.config();
const fs = require('fs');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const archiver = require('archiver');

module.exports = {
    run: async function handleMessage(message, client, currentAttachments, isChained) {
        if (message.content.includes('help')) {
            const commandUsed = message.content.split(' ').find(part => part !== 'help' && !part.startsWith('<@'));
            return message.reply({
                content: `${quickdesc}\n` +
                    `### Arguments:\n`+
                    `\`${commandUsed}:frame\` only converts the first frame of the video\n` +
                    `### Aliases:\n\`${altnames.join(', ')}\``,
            });
        }
        const hasAttachment = currentAttachments || message.attachments;
        const firstAttachment = hasAttachment.first();
        const isVideo = firstAttachment && firstAttachment.contentType.includes('video');
        const attachment = firstAttachment;
        if (!isVideo && !attachment.contentType.includes('gif')) {
            return message.reply({ content: 'provide a video file to convert.' });
        } else {
            const fileUrl = attachment.url;
            const userName = message.author.id;
            const fileType = attachment.contentType;
            const contentType = attachment.contentType.split('/')[1];
            const rnd5dig = Math.floor(Math.random() * 90000) + 10000;
            
            const downloadFile = await axios.get(fileUrl, { responseType: 'arraybuffer' });
            const fileData = downloadFile.data;
            await fs.writeFileSync(`temp/${userName}-TOIMGCONV-${rnd5dig}.${contentType}`, fileData);

            try {
                message.react('<a:pukekospin:1311021344149868555>').catch(() => message.react('👍'));
                await convertToImages(message, userName, contentType, rnd5dig);
            } catch (err) {
                console.error('Error:', err);
                return message.reply({ content: 'Error converting video to gif' });
            } finally {
                // delete all files including S2T in the name, only target mp3, mp4 and txt files, wait 30s before deleting
                const filesToDelete = fs.readdirSync('./temp/').filter((file) => {
                    return file.includes('TOIMGCONV') || file.includes('IMAGES');
                });
                filesToDelete.forEach((file) => {
                    setTimeout(() => {
                    fs.unlinkSync(`./temp/${file}`);
                    }, 10000);
                });
            }
        }
    }
}

async function convertToImages(message, userName, contentType, rnd5dig) {
    const outputDir = `temp/${userName}-IMAGES-${rnd5dig}`;
    const zipPath = `temp/${userName}-IMAGES-${rnd5dig}.zip`;

    // Create output directory
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir);
    }

    return new Promise((resolve, reject) => {
        const ffmpegCommand = ffmpeg(`temp/${userName}-TOIMGCONV-${rnd5dig}.${contentType}`)
            .outputOptions(['-q:v 31']) // Aggressively compress images
            .on('end', async () => {
                try {
                    await zipImages(outputDir, zipPath);
                    const stats = fs.statSync(zipPath);
                    const fileSizeInBytes = stats.size;
                    const fileSizeInMegabytes = fileSizeInBytes / (1024 * 1024);

                    if (fileSizeInMegabytes > 25) {
                        fs.unlinkSync(zipPath);
                        return reject(new Error('The zip file is too big to be sent (over 25MB).'));
                    }

                    fs.rmdirSync(outputDir, { recursive: true });
                    await message.reply({ files: [zipPath] });
                    message.reactions.removeAll().catch(console.error);
                    resolve(zipPath);
                } catch (err) {
                    reject(new Error('Zipping images failed: ' + err.message));
                }
            })
            .on('error', (err) => {
                message.reply({ content: 'Error converting video to images' });
                reject(new Error('Image extraction failed: ' + err.message));
            });

        ffmpegCommand.save(`${outputDir}/frame-%04d.jpg`);
    });
}

async function zipImages(sourceDir, zipPath) {
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', () => resolve(zipPath));
        archive.on('error', (err) => reject(err));

        archive.pipe(output);
        archive.directory(sourceDir, false);
        archive.finalize();
    });
}