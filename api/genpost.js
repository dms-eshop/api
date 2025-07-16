const { Octokit } = require('@octokit/rest');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const { formidable } = require('formidable');
const fs = require('fs');

// Enable CORS
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

// Parse form
const parseForm = (req) =>
  new Promise((resolve, reject) => {
    const form = formidable({ multiples: true });
    form.parse(req, (err, fields, files) => {
      if (err) reject(new Error('Form data parse failed.'));
      else resolve({ fields, files });
    });
  });

// Upload to GitHub with UUID filename
const uploadToGitHub = async (octokit, fileBuffer, owner, repo, altText = '') => {
  const webpBuffer = await sharp(fileBuffer).webp({ quality: 80 }).toBuffer();
  const fileName = `${uuidv4()}.webp`;
  const githubFilePath = `public/image/generated/${fileName}`;
  console.log('Uploading:', githubFilePath); // ✅ Confirm it's UUID

  await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: githubFilePath,
    message: `Upload image: ${fileName}`,
    content: webpBuffer.toString('base64'),
    committer: {
      name: 'Vercel Generator',
      email: 'vercel-bot@dms-eshop.com',
    },
    author: {
      name: 'Vercel Generator',
      email: 'vercel-bot@dms-eshop.com',
    },
  });

  return githubFilePath;
};

// API handler
async function handler(req, res) {
  try {
    const { GITHUB_TOKEN } = process.env;
    if (!GITHUB_TOKEN) {
      return res.status(500).json({ success: false, message: 'Missing GITHUB_TOKEN.' });
    }

    const GITHUB_OWNER = 'dms-eshop';
    const GITHUB_REPO = 'cloud';
    const CUSTOM_DOMAIN = 'https://storage.dms-eshop.com';
    const octokit = new Octokit({ auth: GITHUB_TOKEN });

    const { fields, files } = await parseForm(req);
    const title = Array.isArray(fields.title) ? fields.title[0] : fields.title || 'Product';

    const mainImageFile = files.mainImage?.[0];
    if (!mainImageFile) {
      return res.status(400).json({ success: false, message: 'Main image is required.' });
    }

    const mainBuffer = fs.readFileSync(mainImageFile.filepath);
    const mainPath = await uploadToGitHub(octokit, mainBuffer, GITHUB_OWNER, GITHUB_REPO, title);
    const mainImageUrl = `${CUSTOM_DOMAIN}/${mainPath}`;

    let thumbImageUrls = [];
    const thumbFiles = Array.isArray(files.thumbImages)
      ? files.thumbImages.filter(Boolean)
      : files.thumbImages
      ? [files.thumbImages]
      : [];

    if (thumbFiles.length > 0) {
      const promises = thumbFiles.map((file, index) => {
        const buffer = fs.readFileSync(file.filepath);
        return uploadToGitHub(octokit, buffer, GITHUB_OWNER, GITHUB_REPO, `${title} Thumbnail ${index + 1}`);
      });

      const thumbPaths = await Promise.all(promises);
      thumbImageUrls = thumbPaths.map((p) => `${CUSTOM_DOMAIN}/${p}`);
    }

    res.status(200).json({
      success: true,
      mainImageUrl,
      thumbImageUrls,
    });
  } catch (error) {
    console.error('Upload handler error:', error);
    res.status(500).json({
      success: false,
      message: `Failed to upload image to GitHub: ${error.message || error}`,
    });
  }
}

module.exports = allowCors(handler);
