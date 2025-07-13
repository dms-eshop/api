const { Octokit } = require('@octokit/rest');
const sharp = require('sharp');
const { formidable } = require('formidable');
const allowCors = (fn) => async (req, res) => {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }
    return await fn(req, res);
};
async function parseForm(req) {
    return new Promise((resolve, reject) => {
        const form = formidable({ maxFileSize: 5 * 1024 * 1024 }); // 5MB limit
        form.parse(req, (err, fields, files) => {
            if (err) reject(err);
            else resolve({ fields, files });
        });
    });
}
async function handler(req, res) {
    try {
        const { GITHUB_TOKEN } = process.env;
        const octokit = new Octokit({ auth: GITHUB_TOKEN });
        const { files } = await parseForm(req);
        const imageFile = files.image?.[0];
        if (!imageFile) {
            return res.status(400).json({ message: 'Image file is required.' });
        }
        const webpBuffer = await sharp(imageFile.filepath)
            .webp({ quality: 85 }) // Quality can be adjusted
            .toBuffer();
        const fileName = `${Date.now()}-${Math.round(Math.random() * 1E9)}.webp`;
        const githubFilePath = `public/image/generated/${fileName}`;
        await octokit.repos.createOrUpdateFileContents({
            owner: 'dms-eshop',
            repo: 'cloud',
            path: githubFilePath,
            message: `feat: Upload generated image ${fileName}`,
            content: webpBuffer.toString('base64'),
        });
        const finalImageUrl = `https://storage.dms-eshop.com/${githubFilePath}`;
        res.status(200).json({ 
            message: 'Image uploaded successfully!', 
            url: finalImageUrl 
        });
    } catch (error) {
        console.error('Upload Error:', error);
        res.status(500).json({ message: error.message || 'An internal server error occurred.' });
    }
}
module.exports = allowCors(handler);
