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

// Form parser
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

// GitHub uploader with SHA check
const uploadToGitHub = async (octokit, fileBuffer, owner, repo, altText = '') => {
    try {
        const webpBuffer = await sharp(fileBuffer).webp({ quality: 80 }).toBuffer();
        const randomNumber = Math.floor(1000000000 + Math.random() * 9000000000);
        const fileName = `${randomNumber}.webp`;
        const githubFilePath = `public/image/generated/${fileName}`;

        let existingFileSha = null;

        try {
            const { data: existingFile } = await octokit.repos.getContent({
                owner,
                repo,
                path: githubFilePath,
            });
            if (existingFile && existingFile.sha) {
                existingFileSha = existingFile.sha;
            }
        } catch (err) {
            if (err.status !== 404) {
                console.error('Error checking for existing file:', err);
                throw new Error('Failed to check for existing file on GitHub');
            }
        }

        await octokit.repos.createOrUpdateFileContents({
            owner,
            repo,
            path: githubFilePath,
            message: `feat: Add generated image ${fileName} (${altText.substring(0, 50)}...)`,
            content: webpBuffer.toString('base64'),
            sha: existingFileSha || undefined,
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
        console.error('Error uploading to GitHub:', uploadError);
        throw new Error(`Failed to upload image to GitHub: ${uploadError.message || uploadError}`);
    }
};

// Main API handler
async function handler(req, res) {
    try {
        const { GITHUB_TOKEN } = process.env;
        if (!GITHUB_TOKEN) {
            return res.status(500).json({ success: false, message: 'Server environment variable GITHUB_TOKEN is not configured.' });
        }

        const GITHUB_OWNER = 'dms-eshop';
        const GITHUB_REPO = 'cloud';
        const CUSTOM_DOMAIN = 'https://storage.dms-eshop.com';

        const octokit = new Octokit({ auth: GITHUB_TOKEN });
        const { fields, files } = await parseForm(req);

        const productTitle = Array.isArray(fields.title) ? fields.title[0] : fields.title || 'Product Image';
        const mainImageFile = files.mainImage?.[0];

        if (!mainImageFile) {
            return res.status(400).json({ success: false, message: 'Main image is required.' });
        }

        const mainImageContent = fs.readFileSync(mainImageFile.filepath);
        const mainImagePath = await uploadToGitHub(octokit, mainImageContent, GITHUB_OWNER, GITHUB_REPO, productTitle);
        const mainImageUrl = `${CUSTOM_DOMAIN}/${mainImagePath}`;

        let thumbImageUrls = [];
        const thumbImageFiles = Array.isArray(files.thumbImages) ? files.thumbImages.filter(Boolean) : (files.thumbImages ? [files.thumbImages] : []);

        if (thumbImageFiles.length > 0) {
            const uploadPromises = thumbImageFiles.map((file, index) => {
                const content = fs.readFileSync(file.filepath);
                return uploadToGitHub(octokit, content, GITHUB_OWNER, GITHUB_REPO, `${productTitle} Thumbnail ${index + 1}`);
            });
            const thumbPaths = await Promise.all(uploadPromises);
            thumbImageUrls = thumbPaths.map(path => `${CUSTOM_DOMAIN}/${path}`);
        }

        res.status(200).json({
            success: true,
            mainImageUrl,
            thumbImageUrls
        });

    } catch (error) {
        console.error('Processing Error in handler:', error);
        res.status(500).json({ success: false, message: error.message || 'An internal server error occurred.' });
    }
}

module.exports = allowCors(handler);
