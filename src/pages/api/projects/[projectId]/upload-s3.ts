import { NextApiRequest, NextApiResponse } from 'next';
import { IncomingForm, File } from 'formidable';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { uploadFileToS3, generateS3Key, listFilesInS3, deleteFileFromS3 } from '../../../../utils/aws-s3';

const execAsync = promisify(exec);

export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
    externalResolver: true,
  },
};

const ensureDirectoryExists = (dirPath: string) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const cleanupTempFiles = async (tempFiles: (File | File[])[]) => {
  for (const fileOrArray of tempFiles) {
    const files = Array.isArray(fileOrArray) ? fileOrArray : [fileOrArray];
    for (const file of files) {
      if (file && file.filepath && fs.existsSync(file.filepath)) {
        try {
          await fs.promises.unlink(file.filepath);
          console.log(`Cleaned up temp file: ${file.filepath}`);
        } catch (error) {
          console.warn(`Failed to cleanup temp file ${file.filepath}:`, error);
        }
      }
    }
  }
};

// Helper function to download file from S3 to local temp directory
const downloadFromS3ToTemp = async (s3Key: string, localPath: string): Promise<void> => {
  try {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const { s3Client, BUCKET_NAME } = await import('../../../../utils/aws-s3');
    
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
    });
    
    const response = await s3Client.send(command);
    
    if (response.Body) {
      const chunks: Uint8Array[] = [];
      const stream = response.Body as any;
      
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      
      const buffer = Buffer.concat(chunks);
      await fs.promises.writeFile(localPath, buffer);
      console.log(`Downloaded ${s3Key} to ${localPath}`);
    } else {
      throw new Error('No file content received from S3');
    }
  } catch (error) {
    console.error(`Failed to download ${s3Key} from S3:`, error);
    throw new Error(`Failed to download file from S3: ${error}`);
  }
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { projectId } = req.query;
  
  if (!projectId || typeof projectId !== 'string') {
    return res.status(400).json({ error: 'Project ID is required' });
  }

  // Check AWS S3 configuration
  const requiredEnvVars = [
    'PANOR_AWS_ACCESS_KEY_ID',
    'PANOR_AWS_SECRET_ACCESS_KEY', 
    'PANOR_AWS_S3_BUCKET_NAME'
  ];
  
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  if (missingVars.length > 0) {
    return res.status(500).json({
      error: 'AWS S3 configuration incomplete',
      message: `Missing required environment variables: ${missingVars.join(', ')}. Please configure your AWS credentials in the .env file.`,
      missingVariables: missingVars
    });
  }

  let tempFilesToCleanup: (File | File[])[] = [];

  try {
    // Ensure tmp directory exists for temporary processing
    const tmpDir = path.join(process.cwd(), 'tmp');
    ensureDirectoryExists(tmpDir);
    
    const form = new IncomingForm({
      maxFields: 1000,
      allowEmptyFiles: false,
      minFileSize: 1,
      uploadDir: tmpDir,
      keepExtensions: true,
      multiples: true,
      maxFileSize: 100 * 1024 * 1024, // 100MB per file
      maxTotalFileSize: 1024 * 1024 * 1024, // 1GB total
      maxFieldsSize: 20 * 1024 * 1024, // 20MB for fields
    });
    
    const { fields, files } = await new Promise<{ fields: any; files: any }>((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve({ fields, files });
      });
    });

    const deleteAll = fields.deleteAll && fields.deleteAll[0] === 'true';

    // Handle deletion of existing S3 files if requested
    if (deleteAll) {
      try {
        const existingFiles = await listFilesInS3(`projects/${projectId}/`);
        for (const fileKey of existingFiles) {
          await deleteFileFromS3(fileKey);
        }
        console.log(`Deleted ${existingFiles.length} existing files from S3 for project ${projectId}`);
      } catch (error) {
        console.warn('Error deleting existing S3 files:', error);
      }
    }

    // Handle CSV file upload to S3
    const csvFile = Array.isArray(files.csv) ? files.csv[0] : files.csv;
    const existingCsv = fields.existing_csv ? fields.existing_csv[0] : null;
    let csvS3Key = '';
    let csvLocalPath = '';

    if (csvFile) {
      tempFilesToCleanup.push(csvFile);
      
      // Upload CSV to S3
      const csvBuffer = await fs.promises.readFile(csvFile.filepath);
      csvS3Key = generateS3Key(projectId, 'data/pano-poses.csv');
      await uploadFileToS3(csvBuffer, csvS3Key, 'text/csv');
      
      // Also save locally for config generation
      const localDataDir = path.join(tmpDir, projectId, 'data');
      ensureDirectoryExists(localDataDir);
      csvLocalPath = path.join(localDataDir, 'pano-poses.csv');
      await fs.promises.copyFile(csvFile.filepath, csvLocalPath);
      
      console.log(`CSV uploaded to S3: ${csvS3Key}`);
    } else if (existingCsv) {
      csvS3Key = `projects/${projectId}/data/${existingCsv}`;
      // Download existing CSV from S3 for local processing
      const localDataDir = path.join(tmpDir, projectId, 'data');
      ensureDirectoryExists(localDataDir);
      csvLocalPath = path.join(localDataDir, existingCsv);
      await downloadFromS3ToTemp(csvS3Key, csvLocalPath);
    } else {
      return res.status(400).json({ error: 'CSV file is required' });
    }

    // Handle image files upload to S3
    const imageFiles = Array.isArray(files.images) ? files.images : (files.images ? [files.images] : []);
    const existingImages = fields.existing_images ? (Array.isArray(fields.existing_images) ? fields.existing_images : [fields.existing_images]) : [];

    if (imageFiles.length === 0 && existingImages.length === 0) {
      return res.status(400).json({ error: 'At least one image file is required' });
    }
    
    if (imageFiles.length > 0) {
      tempFilesToCleanup.push(files.images);
    }

    // Check for overwrite flag
    const allowOverwrite = fields.overwrite && fields.overwrite[0] === 'true';
    
    // Check for duplicate file names in S3 if overwrite is not allowed
    if (!allowOverwrite) {
      const duplicateFiles: string[] = [];
      const existingS3Files = await listFilesInS3(`projects/${projectId}/images/`);
      const existingFileNames = existingS3Files.map(key => path.basename(key));
      
      for (const imageFile of imageFiles) {
        if (imageFile && imageFile.originalFilename) {
          if (existingFileNames.includes(imageFile.originalFilename)) {
            duplicateFiles.push(imageFile.originalFilename);
          }
        }
      }

      if (duplicateFiles.length > 0) {
        await cleanupTempFiles(tempFilesToCleanup);
        return res.status(409).json({ 
          error: 'Duplicate file names detected',
          duplicates: duplicateFiles,
          message: `The following files already exist: ${duplicateFiles.join(', ')}. Please rename them or choose different files.`
        });
      }
    }

    // Upload images to S3 and save locally for config generation
    const uploadedImages: string[] = [];
    const localImagesDir = path.join(tmpDir, projectId, 'images');
    ensureDirectoryExists(localImagesDir);

    for (const imageFile of imageFiles) {
      if (imageFile && imageFile.originalFilename) {
        // Upload to S3
        const imageBuffer = await fs.promises.readFile(imageFile.filepath);
        const imageS3Key = generateS3Key(projectId, `images/${imageFile.originalFilename}`);
        await uploadFileToS3(imageBuffer, imageS3Key, imageFile.mimetype || 'image/jpeg');
        
        // Save locally for config generation
        const localImagePath = path.join(localImagesDir, imageFile.originalFilename);
        await fs.promises.copyFile(imageFile.filepath, localImagePath);
        
        uploadedImages.push(imageFile.originalFilename);
        console.log(`Image uploaded to S3: ${imageS3Key}`);
      }
    }

    // Add existing images to the list
    existingImages.forEach((imageName: string) => uploadedImages.push(imageName));
    
    console.log(`Successfully uploaded ${uploadedImages.length} image files to S3:`, uploadedImages);

    // Generate configuration using local files
    try {
      console.log(`Starting configuration generation for project: ${projectId}`);
      
      // Create a temporary public directory structure for config generation
      const tempPublicDir = path.join(tmpDir, 'public');
      const tempProjectDir = path.join(tempPublicDir, projectId);
      ensureDirectoryExists(tempProjectDir);
      
      // Copy files to expected structure
      const tempDataDir = path.join(tempProjectDir, 'data');
      const tempImagesDir = path.join(tempProjectDir, 'images');
      ensureDirectoryExists(tempDataDir);
      ensureDirectoryExists(tempImagesDir);
      
      if (csvLocalPath) {
        await fs.promises.copyFile(csvLocalPath, path.join(tempDataDir, 'pano-poses.csv'));
      }
      
      // Copy images
      const localImages = fs.readdirSync(localImagesDir);
      for (const imageName of localImages) {
        await fs.promises.copyFile(
          path.join(localImagesDir, imageName),
          path.join(tempImagesDir, imageName)
        );
      }
      
      // Set environment variable to use temp directory
      const originalCwd = process.cwd();
      process.env.TEMP_PUBLIC_DIR = tempPublicDir;
      
      const { stdout, stderr } = await execAsync(`node scripts/node/generate-config.js --project "${projectId}" --temp-dir "${tempPublicDir}"`, {
        cwd: originalCwd,
      });
      
      console.log('Config generation output:', stdout);
      if (stderr) {
        console.warn('Config generation warnings:', stderr);
      }

      // Upload generated config files to S3
      const configFiles = ['config.json', 'app-files/index.js', 'app-files/style.css'];
      for (const configFile of configFiles) {
        const configPath = path.join(tempProjectDir, configFile);
        if (fs.existsSync(configPath)) {
          const configBuffer = await fs.promises.readFile(configPath);
          const configS3Key = generateS3Key(projectId, configFile);
          const contentType = configFile.endsWith('.json') ? 'application/json' : 
                             configFile.endsWith('.js') ? 'application/javascript' : 
                             configFile.endsWith('.css') ? 'text/css' : 'text/plain';
          await uploadFileToS3(configBuffer, configS3Key, contentType);
          console.log(`Config file uploaded to S3: ${configS3Key}`);
        }
      }

      // Cleanup temp directory
      fs.rmSync(tempPublicDir, { recursive: true, force: true });

      res.status(200).json({ 
        message: `Files uploaded successfully to S3 for project "${projectId}" and configuration generated!`,
        projectId,
        uploadedFiles: {
          csv: csvS3Key,
          images: uploadedImages
        },
        scriptOutput: stdout
      });
    } catch (scriptError: any) {
      console.error('Configuration generation error:', scriptError);
      
      let errorDetails = 'Unknown configuration error';
      if (scriptError.message) {
        if (scriptError.message.includes('CSV file not found')) {
          errorDetails = 'CSV file was not properly uploaded';
        } else if (scriptError.message.includes('python')) {
          errorDetails = 'Python or required packages (numpy) are not installed';
        } else if (scriptError.message.includes('Permission denied')) {
          errorDetails = 'File permission error - check directory permissions';
        } else {
          errorDetails = scriptError.message;
        }
      }
      
      res.status(500).json({ 
        error: 'Configuration generation failed',
        message: `Files uploaded successfully to S3 for project "${projectId}", but configuration generation failed: ${errorDetails}`,
        projectId,
        details: process.env.NODE_ENV === 'development' ? scriptError.message : undefined,
        manualCommand: `node scripts/node/generate-config.js --project "${projectId}"`
      });
    }

    // Clean up temp files after successful processing
    await cleanupTempFiles(tempFilesToCleanup);

  } catch (error: any) {
    console.error('Upload error:', error);
    
    let errorMessage = 'Internal server error during file upload';
    let statusCode = 500;
    
    if (error.code === 1009 || error.httpCode === 413) {
      errorMessage = 'File upload failed due to size restrictions. Please try with smaller files.';
      statusCode = 413;
    } else if (error.message && error.message.includes('timeout')) {
      errorMessage = 'Upload timeout. Please try again.';
      statusCode = 408;
    } else if (error.name === 'CredentialsProviderError' || error.message?.includes('credentials')) {
      errorMessage = 'AWS credentials are invalid or missing. Please check your .env file configuration.';
      statusCode = 401;
    } else if (error.name === 'NoSuchBucket' || error.message?.includes('bucket')) {
      errorMessage = 'AWS S3 bucket not found. Please check your bucket name in the .env file.';
      statusCode = 404;
    } else if (error.name === 'AccessDenied' || error.message?.includes('Access Denied')) {
      errorMessage = 'Access denied to AWS S3. Please check your IAM permissions.';
      statusCode = 403;
    } else if (error.message && (error.message.includes('AWS') || error.message.includes('S3'))) {
      errorMessage = 'AWS S3 upload failed. Please check your configuration and try again.';
      statusCode = 502;
    }
    
    res.status(statusCode).json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      awsError: process.env.NODE_ENV === 'development' ? {
        name: error.name,
        code: error.code,
        statusCode: error.$metadata?.httpStatusCode
      } : undefined
    });

    // Clean up temp files even on error
    try {
      await cleanupTempFiles(tempFilesToCleanup);
    } catch (cleanupError) {
      console.error('Error during temp file cleanup:', cleanupError);
    }
  }
}