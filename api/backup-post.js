import { Octokit } from '@octokit/rest';
import cors from 'cors';

const corsMiddleware = cors();
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
    
    const { fileName, content } = req.body;
    if (!fileName || !content) {
        return res.status(400).json({ message: 'File name or content is missing.' });
    }

    try {
        const filePath = `public/product/${fileName}`;
        const contentEncoded = Buffer.from(content).toString('base64');

        await octokit.repos.createOrUpdateFileContents({
            ...GITHUB_REPO_CONFIG,
            path: filePath,
            message: `feat: Backup post ${fileName}`,
            content: contentEncoded,
        });

        res.status(200).json({ message: 'Backup successful!', path: filePath });

    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ message: 'Failed to backup post.' });
    }
}
