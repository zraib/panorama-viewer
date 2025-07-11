import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { projectId } = req.query;
  
  if (!projectId || typeof projectId !== 'string') {
    return res.status(400).json({ error: 'Project ID is required' });
  }

  try {
    // Add after imports
    const IMAGES_BASE_PATH = process.env.IMAGES_VOLUME_PATH || path.join(process.cwd(), 'public');
    const projectDir = path.join(IMAGES_BASE_PATH, projectId);
    
    if (!fs.existsSync(projectDir)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const files = {
      csv: null as string | null,
      images: [] as string[]
    };

    // Check for CSV file (pano-poses.csv)
    const csvPath = path.join(projectDir, 'pano-poses.csv');
    if (fs.existsSync(csvPath)) {
      files.csv = 'pano-poses.csv';
    }

    // Check for images directory
    // const imagesDir = path.join(projectDir, 'images');
    const imagesDir = path.join(projectDir, 'images');
    if (fs.existsSync(imagesDir)) {
      const imageFiles = fs.readdirSync(imagesDir)
        .filter(file => {
          const ext = path.extname(file).toLowerCase();
          return ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif'].includes(ext);
        })
        .sort();
      files.images = imageFiles;
    }

    return res.status(200).json({ files });
  } catch (error) {
    console.error('Error getting project files:', error);
    return res.status(500).json({ error: 'Failed to get project files' });
  }
}