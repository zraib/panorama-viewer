/**
 * Storage configuration utility that switches between local and S3 storage
 * based on environment variables
 */

export const isS3StorageEnabled = (): boolean => {
  return process.env.USE_S3_STORAGE === 'true';
};

export const getConfigApiUrl = (projectId: string): string => {
  if (isS3StorageEnabled()) {
    return `/api/projects/${encodeURIComponent(projectId)}/config-s3`;
  }
  return `/api/projects/${encodeURIComponent(projectId)}/config`;
};

export const getProjectsApiUrl = (): string => {
  if (isS3StorageEnabled()) {
    return '/api/projects-s3';
  }
  return '/api/projects';
};

export const getUploadApiUrl = (projectId?: string): string => {
  if (projectId) {
    // Project-specific upload endpoint
    if (isS3StorageEnabled()) {
      return `/api/projects/${encodeURIComponent(projectId)}/upload-s3`;
    }
    return `/api/projects/${encodeURIComponent(projectId)}/upload`;
  }
  
  // General upload endpoint
  if (isS3StorageEnabled()) {
    return '/api/upload-s3';
  }
  return '/api/upload';
};

export const getImageUrl = (projectId: string, imagePath: string): string => {
  if (isS3StorageEnabled()) {
    // For S3, use the API route that provides signed URLs
    return `/api/projects/${encodeURIComponent(projectId)}/images/${imagePath}`;
  }
  // For local storage, use direct file access
  return `/${projectId}/images/${imagePath}`;
};

export const getFileUrl = (filePath: string): string => {
  if (isS3StorageEnabled()) {
    // For S3, use the files-s3 API route that provides signed URLs
    return `/api/files-s3/${filePath}`;
  }
  // For local storage, use the files API route
  return `/api/files/${filePath}`;
};

export const getStorageType = (): 'local' | 's3' => {
  return isS3StorageEnabled() ? 's3' : 'local';
};

/**
 * Get environment-specific configuration
 */
export const getStorageConfig = () => {
  return {
    type: getStorageType(),
    isS3: isS3StorageEnabled(),
    aws: {
      region: process.env.PANOR_AWS_REGION || 'us-east-1',
      bucketName: process.env.PANOR_AWS_S3_BUCKET_NAME || '',
      accessKeyId: process.env.PANOR_AWS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.PANOR_AWS_SECRET_ACCESS_KEY || '',
    },
    upload: {
      maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '50000000'),
      maxFilesPerUpload: parseInt(process.env.MAX_FILES_PER_UPLOAD || '100'),
      timeout: parseInt(process.env.UPLOAD_TIMEOUT || '300000'),
    },
    panorama: {
      configMode: process.env.PANORAMA_CONFIG_MODE || 'development',
      yawOffset: parseFloat(process.env.PANORAMA_YAW_OFFSET || '0'),
      pitchOffset: parseFloat(process.env.PANORAMA_PITCH_OFFSET || '0'),
      cameraOffset: parseFloat(process.env.PANORAMA_CAMERA_OFFSET || '1.6'),
      maxDistance: parseFloat(process.env.PANORAMA_MAX_DISTANCE || '50'),
      maxConnections: parseInt(process.env.PANORAMA_MAX_CONNECTIONS || '10'),
    },
  };
};

/**
 * Validate storage configuration
 */
export const validateStorageConfig = (): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];
  const config = getStorageConfig();

  if (config.isS3) {
    if (!config.aws.bucketName) {
      errors.push('PANOR_AWS_S3_BUCKET_NAME is required when using S3 storage');
    }
    if (!config.aws.accessKeyId) {
      errors.push('PANOR_AWS_ACCESS_KEY_ID is required when using S3 storage');
    }
    if (!config.aws.secretAccessKey) {
      errors.push('PANOR_AWS_SECRET_ACCESS_KEY is required when using S3 storage');
    }
    if (!config.aws.region) {
      errors.push('PANOR_AWS_REGION is required when using S3 storage');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Get debug information about storage configuration
 */
export const getStorageDebugInfo = () => {
  const config = getStorageConfig();
  const validation = validateStorageConfig();

  return {
    storageType: config.type,
    isS3Enabled: config.isS3,
    isConfigValid: validation.isValid,
    configErrors: validation.errors,
    environment: {
      nodeEnv: process.env.NODE_ENV,
      useS3Storage: process.env.USE_S3_STORAGE,
      awsRegion: process.env.PANOR_AWS_REGION,
      bucketName: config.aws.bucketName ? '[SET]' : '[NOT SET]',
      accessKey: config.aws.accessKeyId ? '[SET]' : '[NOT SET]',
      secretKey: config.aws.secretAccessKey ? '[SET]' : '[NOT SET]',
    },
    urls: {
      projectsApi: getProjectsApiUrl(),
      uploadApi: getUploadApiUrl(),
      configApi: (projectId: string) => getConfigApiUrl(projectId),
      imageUrl: (projectId: string, imagePath: string) => getImageUrl(projectId, imagePath),
    },
  };
};