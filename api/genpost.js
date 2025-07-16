// api/genpost.js
const { Octokit } = require('@octokit/rest');
const sharp = require('sharp');
const { formidable } = require('formidable');
const fs = require('fs');

// CORS middleware
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

// Parse form with formidable
const parseForm = (req) => new Promise((resolve, reject) => {
    const form = formidable({ multiples: true });
    form.parse(req, (err, fields, files) => {
        if (err) {
            console.error('Formidable parsing error:', err);
            reject(new Error('Failed to parse form data.'));
        } else {
            resolve({ fields, files });
        }
    });
});

// Upload to GitHub
const uploadToGitHub = async (octokit, buffer, owner, repo, altText = '') => {
    try {
        const webpBuffer = await sharp(buffer).webp({ quality: 80 }).toBuffer();
        const randomNumber = Math.floor(1000000000 + Math.random() * 9000000000);
        const fileName = `${randomNumber}.webp`;
        const githubFilePath = `public/image/generated/${fileName}`;

        await octokit.repos.createOrUpdateFileContents({
            owner,
            repo,
            path: githubFilePath,
            message: `feat: Add image ${fileName} (${altText.substring(0, 50)}...)`,
            content: webpBuffer.toString('base64'),
            committer: {
                name: 'Vercel Post Generator',
                email: 'vercel-bot@dms-eshop.com',
            },
            author: {
                name: 'Vercel Post Generator',
                email: 'vercel-bot@dms-eshop.com',
            },
        });

        return githubFilePath;
    } catch (uploadError) {
        console.error('GitHub Upload Error:', uploadError);
        throw new Error(`Failed to upload image to GitHub: ${uploadError.message || uploadError}`);
    }
};

// Main handler
async function handler(req, res) {
    try {
        const { GITHUB_TOKEN } = process.env;
        if (!GITHUB_TOKEN) {
            return res.status(500).json({ success: false, message: 'GitHub token missing' });
        }

        const GITHUB_OWNER = 'dms-eshop';
        const GITHUB_REPO = 'cloud';
        const CUSTOM_DOMAIN = 'https://storage.dms-eshop.com';

        const octokit = new Octokit({ auth: GITHUB_TOKEN });
        const { fields, files } = await parseForm(req);

        const title = Array.isArray(fields.title) ? fields.title[0] : fields.title || 'Product Image';

        const mainImageFile = files.mainImage?.[0];
        if (!mainImageFile) {
            return res.status(400).json({ success: false, message: 'Main image is required.' });
        }

        const mainBuffer = fs.readFileSync(mainImageFile.filepath);
        const mainImagePath = await uploadToGitHub(octokit, mainBuffer, GITHUB_OWNER, GITHUB_REPO, title);
        const mainImageUrl = `${CUSTOM_DOMAIN}/${mainImagePath}`;

        let thumbImageUrls = [];
        const thumbFiles = Array.isArray(files.thumbImages)
            ? files.thumbImages.filter(Boolean)
            : files.thumbImages
            ? [files.thumbImages]
            : [];

        if (thumbFiles.length > 0) {
            const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
            const thumbPaths = [];

            for (let i = 0; i < thumbFiles.length; i++) {
                const file = thumbFiles[i];
                const buffer = fs.readFileSync(file.filepath);
                const path = await uploadToGitHub(octokit, buffer, GITHUB_OWNER, GITHUB_REPO, `${title} Thumbnail ${i + 1}`);
                thumbPaths.push(path);
                await delay(1000); // Delay to prevent GitHub SHA conflict
            }

            thumbImageUrls = thumbPaths.map(p => `${CUSTOM_DOMAIN}/${p}`);
        }

        res.status(200).json({
            success: true,
            mainImageUrl,
            thumbImageUrls
        });

    } catch (error) {
        console.error('Handler error:', error);
        res.status(500).json({ success: false, message: error.message || 'Internal Server Error' });
    }
}

module.exports = allowCors(handler);
