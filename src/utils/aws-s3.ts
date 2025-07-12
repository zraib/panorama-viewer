import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3Client = new S3Client({
  region: process.env.PANOR_AWS_REGION || process.env.NEXT_PUBLIC_PANOR_AWS_REGION,
  credentials: {
    accessKeyId: process.env.PANOR_AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.PANOR_AWS_SECRET_ACCESS_KEY!,
  },
});

const BUCKET_NAME = process.env.PANOR_AWS_S3_BUCKET_NAME || process.env.NEXT_PUBLIC_PANOR_AWS_S3_BUCKET_NAME;

if (!BUCKET_NAME) {
  throw new Error('AWS S3 bucket name is not configured');
}

export interface UploadResult {
  key: string;
  url: string;
  size: number;
}

/**
 * Upload a file to S3
 */
export async function uploadFileToS3(
  file: Buffer | Uint8Array,
  key: string,
  contentType?: string
): Promise<UploadResult> {
  try {
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: file,
      ContentType: contentType,
    });

    await s3Client.send(command);

    const url = await getSignedUrl(s3Client, new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    }), { expiresIn: 3600 }); // 1 hour expiry

    return {
      key,
      url,
      size: file.length,
    };
  } catch (error) {
    console.error('Error uploading file to S3:', error);
    throw new Error('Failed to upload file to S3');
  }
}

/**
 * Get a signed URL for a file in S3
 */
export async function getSignedUrlForFile(key: string, expiresIn: number = 3600): Promise<string> {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    return await getSignedUrl(s3Client, command, { expiresIn });
  } catch (error) {
    console.error('Error getting signed URL:', error);
    throw new Error('Failed to get signed URL');
  }
}

/**
 * Delete a file from S3
 */
export async function deleteFileFromS3(key: string): Promise<void> {
  try {
    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    await s3Client.send(command);
  } catch (error) {
    console.error('Error deleting file from S3:', error);
    throw new Error('Failed to delete file from S3');
  }
}

/**
 * List files in a specific S3 prefix (folder)
 */
export async function listFilesInS3(prefix: string): Promise<string[]> {
  try {
    const command = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: prefix,
    });

    const response = await s3Client.send(command);
    return response.Contents?.map(obj => obj.Key!) || [];
  } catch (error) {
    console.error('Error listing files in S3:', error);
    throw new Error('Failed to list files in S3');
  }
}

/**
 * Check if a file exists in S3
 */
export async function fileExistsInS3(key: string): Promise<boolean> {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    await s3Client.send(command);
    return true;
  } catch (error: any) {
    if (error.name === 'NoSuchKey') {
      return false;
    }
    throw error;
  }
}

/**
 * Generate a unique key for file storage
 */
export function generateS3Key(projectId: string, fileName: string): string {
  const timestamp = Date.now();
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
  return `projects/${projectId}/${timestamp}_${sanitizedFileName}`;
}

/**
 * Get the public URL for a file (if bucket is configured for public access)
 */
export function getPublicUrl(key: string): string {
  return `https://${BUCKET_NAME}.s3.${process.env.PANOR_AWS_REGION || process.env.NEXT_PUBLIC_PANOR_AWS_REGION}.amazonaws.com/${key}`;
}

export { s3Client, BUCKET_NAME };