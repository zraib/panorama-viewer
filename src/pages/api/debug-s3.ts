import { NextApiRequest, NextApiResponse } from 'next';
import { S3Client, ListBucketsCommand, HeadBucketCommand } from '@aws-sdk/client-s3';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Check environment variables
    const envVars = {
      USE_S3_STORAGE: process.env.USE_S3_STORAGE,
      PANOR_AWS_ACCESS_KEY_ID: process.env.PANOR_AWS_ACCESS_KEY_ID ? '***SET***' : 'NOT_SET',
      PANOR_AWS_SECRET_ACCESS_KEY: process.env.PANOR_AWS_SECRET_ACCESS_KEY ? '***SET***' : 'NOT_SET',
      PANOR_AWS_S3_BUCKET_NAME: process.env.PANOR_AWS_S3_BUCKET_NAME,
      PANOR_AWS_REGION: process.env.PANOR_AWS_REGION,
      NODE_ENV: process.env.NODE_ENV,
    };

    // Check if all required variables are set
    const missingVars = [];
    if (!process.env.PANOR_AWS_ACCESS_KEY_ID) missingVars.push('PANOR_AWS_ACCESS_KEY_ID');
    if (!process.env.PANOR_AWS_SECRET_ACCESS_KEY) missingVars.push('PANOR_AWS_SECRET_ACCESS_KEY');
    if (!process.env.PANOR_AWS_S3_BUCKET_NAME) missingVars.push('PANOR_AWS_S3_BUCKET_NAME');
    if (!process.env.PANOR_AWS_REGION) missingVars.push('PANOR_AWS_REGION');

    if (missingVars.length > 0) {
      return res.status(500).json({
        error: 'Missing required environment variables',
        missingVars,
        envVars
      });
    }

    // Test S3 connection
    const s3Client = new S3Client({
      region: process.env.PANOR_AWS_REGION,
      credentials: {
        accessKeyId: process.env.PANOR_AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.PANOR_AWS_SECRET_ACCESS_KEY!,
      },
    });

    // Test bucket access
    try {
      const headBucketCommand = new HeadBucketCommand({
        Bucket: process.env.PANOR_AWS_S3_BUCKET_NAME!,
      });
      
      await s3Client.send(headBucketCommand);
      
      return res.status(200).json({
        status: 'SUCCESS',
        message: 'S3 connection and bucket access successful',
        envVars,
        bucketAccess: 'OK'
      });
    } catch (bucketError: any) {
      return res.status(500).json({
        error: 'S3 bucket access failed',
        bucketError: {
          name: bucketError.name,
          message: bucketError.message,
          code: bucketError.$metadata?.httpStatusCode,
        },
        envVars
      });
    }
  } catch (error: any) {
    return res.status(500).json({
      error: 'S3 diagnostic failed',
      details: {
        name: error.name,
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      }
    });
  }
}