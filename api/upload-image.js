import { Octokit } from '@octokit/rest';
import formidable from 'formidable';
import fs from 'fs/promises';
import path from 'path';
import cors from 'cors';

const corsMiddleware = cors();

export const config = {
    api: { bodyParser: false },
};

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const GITHUB_REPO_CONFIG = {
    owner: 'dms-eshop',
    repo: 'cloud',
};

export default async function handler(req, res) {
    await new Promise((resolve, reject) => {
        corsMiddleware(req, res, (result) => result instanceof Error ? reject(result) : resolve(result));
    });

    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    try {
        const form = formidable({});
        const [fields, files] = await form.parse(req);
        
        const imageFile = files.image[0];
        const fileId = fields.fileId[0];

        if (!imageFile || !fileId) {
            return res.status(400).json({ message: 'Image file or File ID is missing.' });
        }

        const fileExtension = path.extname(imageFile.originalFilename);
        const fileName = `${fileId}${fileExtension}`;
        const filePath = `public/image/generated/${fileName}`;
        
        const fileContent = await fs.readFile(imageFile.filepath);
        const contentEncoded = fileContent.toString('base64');

        await octokit.repos.createOrUpdateFileContents({
            ...GITHUB_REPO_CONFIG,
            path: filePath,
            message: `feat: Upload image ${fileName}`,
            content: contentEncoded,
        });

        const imageUrl = `https://storage.dms-eshop.com/${filePath}`;
        res.status(200).json({ imageUrl });

    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ message: 'Failed to upload image.' });
    }
}
