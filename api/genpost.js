// api/genpost.js
const { Octokit } = require('@octokit/rest');
const sharp = require('sharp');
const { formidable } = require('formidable');
const fs = require('fs'); // Node.js built-in file system module

// CORS middleware to allow cross-origin requests
const allowCors = (fn) => async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*'); // Allow all origins
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS'); // Allowed HTTP methods
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); // Allowed headers
    if (req.method === 'OPTIONS') { // Handle pre-flight requests from the browser
        res.status(200).end();
        return;
    }
    return await fn(req, res); // Call the actual handler function
};

// Helper function to parse multipart form data using formidable
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

// Helper function to upload an image buffer to GitHub
const uploadToGitHub = async (octokit, fileBuffer, owner, repo, altText = '') => {
    try {
        // Convert the image buffer to WebP format for optimization
        const webpBuffer = await sharp(fileBuffer).webp({ quality: 80 }).toBuffer();
        
        // Generate a random 10-digit number for the filename
        const randomNumber = Math.floor(1000000000 + Math.random() * 9000000000); // Generates a 10-digit number
        const fileName = `${randomNumber}.webp`;
        const githubFilePath = `public/image/generated/${fileName}`; // Define the path in the GitHub repo

        // Create or update the file content in the GitHub repository
        await octokit.repos.createOrUpdateFileContents({
            owner,
            repo,
            path: githubFilePath,
            message: `feat: Add generated image ${fileName} (${altText.substring(0, 50)}...)`, // Commit message with truncated alt text
            content: webpBuffer.toString('base64'), // Base64 encode the image buffer
            committer: {
                name: 'Vercel Post Generator',
                email: 'vercel-bot@dms-eshop.com',
            },
            author: {
                name: 'Vercel Post Generator',
                email: 'vercel-bot@dms-eshop.com',
            },
        });

        return githubFilePath; // Return the path where the file was uploaded
    } catch (uploadError) {
        console.error('Error uploading to GitHub:', uploadError);
        throw new Error(`Failed to upload image to GitHub: ${uploadError.message || uploadError}`);
    }
};

// Main handler function for the API endpoint
async function handler(req, res) {
    try {
        const { GITHUB_TOKEN } = process.env; // Get GitHub token from environment variables

        if (!GITHUB_TOKEN) {
            return res.status(500).json({ success: false, message: 'Server environment variable GITHUB_TOKEN is not configured.' });
        }

        const GITHUB_OWNER = 'dms-eshop'; // GitHub repository owner
        const GITHUB_REPO = 'cloud'; // GitHub repository name
        const CUSTOM_DOMAIN = 'https://storage.dms-eshop.com'; // Custom domain for accessing images

        const octokit = new Octokit({ auth: GITHUB_TOKEN }); // Initialize Octokit with the token
        const { fields, files } = await parseForm(req); // Parse the incoming form data to get fields and files

        const productTitle = Array.isArray(fields.title) ? fields.title[0] : fields.title || 'Product Image';

        const mainImageFile = files.mainImage?.[0]; 
        if (!mainImageFile) {
            return res.status(400).json({ success: false, message: 'Main image is required.' });
        }

        const mainImageContent = fs.readFileSync(mainImageFile.filepath);
        const mainImagePath = await uploadToGitHub(octokit, mainImageContent, GITHUB_OWNER, GITHUB_REPO, productTitle); // Corrected: GITHUB_REPO
        const mainImageUrl = `${CUSTOM_DOMAIN}/${mainImagePath}`;

        let thumbImageUrls = [];
        const thumbImageFiles = Array.isArray(files.thumbImages) ? files.thumbImages.filter(Boolean) : (files.thumbImages ? [files.thumbImages] : []);
        
        if (thumbImageFiles.length > 0) {
            const uploadPromises = thumbImageFiles.map((file, index) => {
                const content = fs.readFileSync(file.filepath);
                return uploadToGitHub(octokit, content, GITHUB_OWNER, GITHUB_REPO, `${productTitle} Thumbnail ${index + 1}`); // Corrected: GITHUB_REPO
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
        console.error('Processing Error in handler:', error); // More specific error log
        res.status(500).json({ success: false, message: error.message || 'An internal server error occurred.' });
    }
}

module.exports = allowCors(handler);
