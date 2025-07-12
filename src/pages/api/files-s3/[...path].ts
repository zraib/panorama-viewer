import { NextApiRequest, NextApiResponse } from 'next';
import { fileExistsInS3 } from '../../../utils/aws-s3';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client({
  region: process.env.PANOR_AWS_REGION || process.env.NEXT_PUBLIC_PANOR_AWS_REGION,
  credentials: {
    accessKeyId: process.env.PANOR_AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.PANOR_AWS_SECRET_ACCESS_KEY!,
  },
});

const BUCKET_NAME = process.env.PANOR_AWS_S3_BUCKET_NAME || process.env.NEXT_PUBLIC_PANOR_AWS_S3_BUCKET_NAME;

// Helper function to get MIME type from file extension
const getMimeType = (filename: string): string => {
  const ext = filename.split('.').pop()?.toLowerCase();
  const mimeTypes: { [key: string]: string } = {
    'pdf': 'application/pdf',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'mp4': 'video/mp4',
    'webm': 'video/webm',
    'txt': 'text/plain',
    'json': 'application/json',
  };
  return mimeTypes[ext || ''] || 'application/octet-stream';
};

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

    // Get the file from S3
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
    });

    const response = await s3Client.send(command);
    
    if (!response.Body) {
      return res.status(404).json({ error: 'File content not found' });
    }

    // Get the filename for MIME type detection
    const filename = filePath[filePath.length - 1];
    const mimeType = getMimeType(filename);

    // Set appropriate headers
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    
    // For PDFs, set additional headers to ensure proper display
    if (mimeType === 'application/pdf') {
      res.setHeader('Content-Disposition', 'inline');
      res.setHeader('X-Content-Type-Options', 'nosniff');
    }

    // Stream the file content
    const stream = response.Body as any;
    
    if (stream.pipe) {
      // Node.js stream
      stream.pipe(res);
    } else {
      // Handle other types of streams
      const chunks: Uint8Array[] = [];
      const reader = stream.getReader();
      
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }
        
        const buffer = Buffer.concat(chunks);
        res.send(buffer);
      } finally {
        reader.releaseLock();
      }
    }
    
  } catch (error) {
    console.error('S3 file serving error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}