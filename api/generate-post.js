const { Octokit } = require('@octokit/rest');
const sharp = require('sharp');
const { formidable } = require('formidable');

const allowCors = (fn) => async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }
    return await fn(req, res);
};

const parseForm = (req) => new Promise((resolve, reject) => {
    const form = formidable({ multiples: true });
    form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve({ fields, files });
    });
});

const uploadToGitHub = async (octokit, fileBuffer, owner, repo) => {
    const webpBuffer = await sharp(fileBuffer).webp({ quality: 80 }).toBuffer();
    const fileName = `${Date.now()}-${Math.round(Math.random() * 1E9)}.webp`;
    const githubFilePath = `public/image/generated/${fileName}`;

    await octokit.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: githubFilePath,
        message: `feat: Add product image ${fileName}`,
        content: webpBuffer.toString('base64'),
    });

    return githubFilePath;
};

async function handler(req, res) {
    try {
        const { GITHUB_TOKEN, CUSTOM_DOMAIN } = process.env;
        const GITHUB_OWNER = 'dms-eshop';
        const GITHUB_REPO = 'cloud';
        
        const octokit = new Octokit({ auth: GITHUB_TOKEN });
        const { fields, files } = await parseForm(req);

        // Upload Main Image
        const mainImageFile = files.mainImage?.[0];
        if (!mainImageFile) {
            return res.status(400).json({ message: 'Main image is required.' });
        }
        const mainImageContent = require('fs').readFileSync(mainImageFile.filepath);
        const mainImagePath = await uploadToGitHub(octokit, mainImageContent, GITHUB_OWNER, GITHUB_REPO);
        const mainImageUrl = `${CUSTOM_DOMAIN}/${mainImagePath}`;

        // Upload Thumbnail Images
        let thumbImageUrls = [];
        const thumbImageFiles = files.thumbImages;
        if (thumbImageFiles) {
            const uploadPromises = thumbImageFiles.map(file => {
                const content = require('fs').readFileSync(file.filepath);
                return uploadToGitHub(octokit, content, GITHUB_OWNER, GITHUB_REPO);
            });
            const thumbPaths = await Promise.all(uploadPromises);
            thumbImageUrls = thumbPaths.map(path => `${CUSTOM_DOMAIN}/${path}`);
        }

        // Send back the URLs
        res.status(200).json({
            success: true,
            mainImageUrl,
            thumbImageUrls
        });

    } catch (error) {
        console.error('Processing Error:', error);
        res.status(500).json({ success: false, message: error.message || 'An internal server error occurred.' });
    }
}

module.exports = allowCors(handler);
