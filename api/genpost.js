// api/
const { Octokit } = require('@octokit/rest');
const sharp = require('sharp');
const { formidable } = require('formidable');
const fs = require('fs'); // Node.js built-in file system module

// CORS middleware to allow cross-origin requests
// This is crucial if your frontend is hosted on a different domain/subdomain
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
    // formidable({ multiples: true }) allows handling multiple files with the same field name
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
    // Convert the image buffer to WebP format for optimization
    // quality: 80 balances file size and visual quality
    const webpBuffer = await sharp(fileBuffer).webp({ quality: 80 }).toBuffer();
    // Generate a unique filename using timestamp and a random number
    const fileName = `${Date.now()}-${Math.round(Math.random() * 1E9)}.webp`;
    const githubFilePath = `public/image/generated/${fileName}`; // Define the path in the GitHub repo

    // Create or update the file content in the GitHub repository
    // Since we are creating unique filenames, we are always doing a 'create' operation.
    // The 'sha' parameter is omitted because we are not updating an existing file with a known SHA.
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
};

// Main handler function for the API endpoint
async function handler(req, res) {
    try {
        const { GITHUB_TOKEN } = process.env; // Get GitHub token from environment variables

        if (!GITHUB_TOKEN) {
            // If the token is not configured, return a server error
            return res.status(500).json({ success: false, message: 'Server environment variable GITHUB_TOKEN is not configured.' });
        }

        const GITHUB_OWNER = 'dms-eshop'; // GitHub repository owner
        const GITHUB_REPO = 'cloud'; // GitHub repository name
        const CUSTOM_DOMAIN = 'https://storage.dms-eshop.com'; // Custom domain for accessing images

        const octokit = new Octokit({ auth: GITHUB_TOKEN }); // Initialize Octokit with the token
        const { fields, files } = await parseForm(req); // Parse the incoming form data to get fields and files

        // Ensure productTitle is a string, handle cases where formidable might return an array
        const productTitle = Array.isArray(fields.title) ? fields.title[0] : fields.title || 'Product Image';

        // Handle the main product image
        // formidable stores single files under `files.fieldName[0]`
        const mainImageFile = files.mainImage?.[0]; 
        if (!mainImageFile) {
            // If no main image is provided, return a bad request error
            return res.status(400).json({ success: false, message: 'Main image is required.' });
        }

        // Read the main image file content from the temporary path provided by formidable
        const mainImageContent = fs.readFileSync(mainImageFile.filepath);
        // Upload the main image to GitHub
        const mainImagePath = await uploadToGitHub(octokit, mainImageContent, GITHUB_OWNER, GITHUB_REPO, productTitle);
        const mainImageUrl = `${CUSTOM_DOMAIN}/${mainImagePath}`; // Construct the full URL for the main image

        // Handle thumbnail images (if any)
        let thumbImageUrls = [];
        // formidable stores multiple files with the same name as an array
        // Ensure thumbImages is an array and filter out any potential undefined/null entries
        const thumbImageFiles = Array.isArray(files.thumbImages) ? files.thumbImages.filter(Boolean) : (files.thumbImages ? [files.thumbImages] : []);
        
        if (thumbImageFiles.length > 0) {
            // Create an array of promises for uploading each thumbnail
            const uploadPromises = thumbImageFiles.map((file, index) => {
                const content = fs.readFileSync(file.filepath); // Read thumbnail content
                return uploadToGitHub(octokit, content, GITHUB_OWNER, GITHUB_REPO, `${productTitle} Thumbnail ${index + 1}`); // Upload thumbnail
            });
            // Wait for all thumbnail uploads to complete
            const thumbPaths = await Promise.all(uploadPromises);
            // Construct full URLs for all thumbnails
            thumbImageUrls = thumbPaths.map(path => `${CUSTOM_DOMAIN}/${path}`);
        }

        // Return a successful response with the URLs of uploaded images
        res.status(200).json({
            success: true,
            mainImageUrl,
            thumbImageUrls
        });

    } catch (error) {
        // Log the error and send an internal server error response
        console.error('Processing Error:', error);
        res.status(500).json({ success: false, message: error.message || 'An internal server error occurred.' });
    }
}

// Export the handler wrapped with the CORS middleware
module.exports = allowCors(handler);
