import { NextApiRequest, NextApiResponse } from 'next';
import { getSignedUrlForFile, fileExistsInS3 } from '../../../../../utils/aws-s3';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { projectId, path } = req.query;
  
  if (!projectId || typeof projectId !== 'string') {
    return res.status(400).json({ error: 'Project ID is required' });
  }
  
  if (!path || !Array.isArray(path)) {
    return res.status(400).json({ error: 'Image path is required' });
  }
  
  const imagePath = path.join('/');
  
  try {
    const imageKey = `projects/${projectId}/images/${imagePath}`;
    
    // Check if image exists in S3
    const imageExists = await fileExistsInS3(imageKey);
    
    if (!imageExists) {
      return res.status(404).json({ error: 'Image not found' });
    }
    
    // Get signed URL for the image
    const imageUrl = await getSignedUrlForFile(imageKey, 3600); // 1 hour expiry
    
    // Redirect to the signed URL
    res.redirect(302, imageUrl);
    
  } catch (error: any) {
    console.error('Image S3 API error:', error);
    
    if (error.message?.includes('NoSuchKey') || error.message?.includes('NotFound')) {
      return res.status(404).json({ error: 'Image not found' });
    }
    
    res.status(500).json({ 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}