import { NextApiRequest, NextApiResponse } from 'next';
import { getSignedUrlForFile, fileExistsInS3 } from '../../../utils/aws-s3';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { path: filePath } = req.query;
    
    if (!filePath || !Array.isArray(filePath)) {
      return res.status(400).json({ error: 'Invalid file path' });
    }

    // Construct the S3 key from the file path
    const s3Key = filePath.join('/');
    
    // Check if file exists in S3
    const fileExists = await fileExistsInS3(s3Key);
    
    if (!fileExists) {
      console.log('File not found in S3:', s3Key);
      return res.status(404).json({ error: 'File not found' });
    }

    // Generate signed URL for the file
    const signedUrl = await getSignedUrlForFile(s3Key, 3600); // 1 hour expiry
    
    // Redirect to the signed URL
    res.redirect(302, signedUrl);
    
  } catch (error) {
    console.error('S3 file serving error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}