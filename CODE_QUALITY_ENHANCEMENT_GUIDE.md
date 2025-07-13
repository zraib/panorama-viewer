# Code Quality and Maintainability Enhancement Guide

## Overview
This guide provides actionable insights and recommendations to enhance the code quality, maintainability, and robustness of the Panorama Viewer application.

## 🔧 Immediate Improvements

### 1. Environment Configuration Management

**Current Issue**: Environment variables are scattered and not properly validated.

**Recommended Solution**:
```javascript
// Create src/config/environment.js
const requiredEnvVars = {
  USE_S3_STORAGE: 'boolean',
  PANOR_AWS_ACCESS_KEY_ID: 'string',
  PANOR_AWS_SECRET_ACCESS_KEY: 'string',
  PANOR_AWS_S3_BUCKET_NAME: 'string',
  PANOR_AWS_REGION: 'string'
};

export function validateEnvironment() {
  const missing = [];
  const invalid = [];
  
  Object.entries(requiredEnvVars).forEach(([key, type]) => {
    const value = process.env[key];
    if (!value) missing.push(key);
    else if (type === 'boolean' && !['true', 'false'].includes(value)) {
      invalid.push(`${key} must be 'true' or 'false'`);
    }
  });
  
  if (missing.length || invalid.length) {
    throw new Error(`Environment validation failed:\n${[...missing.map(k => `Missing: ${k}`), ...invalid].join('\n')}`);
  }
}
```

### 2. Error Handling and Logging

**Current Issue**: Limited error handling and no structured logging.

**Recommended Solution**:
```javascript
// Create src/utils/logger.js
export const logger = {
  info: (message, meta = {}) => console.log(JSON.stringify({ level: 'info', message, ...meta, timestamp: new Date().toISOString() })),
  error: (message, error = null, meta = {}) => console.error(JSON.stringify({ level: 'error', message, error: error?.message, stack: error?.stack, ...meta, timestamp: new Date().toISOString() })),
  warn: (message, meta = {}) => console.warn(JSON.stringify({ level: 'warn', message, ...meta, timestamp: new Date().toISOString() }))
};

// Create src/utils/errorHandler.js
export function withErrorHandling(handler) {
  return async (req, res) => {
    try {
      return await handler(req, res);
    } catch (error) {
      logger.error('API Error', error, { url: req.url, method: req.method });
      return res.status(500).json({ 
        error: 'Internal Server Error', 
        message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong' 
      });
    }
  };
}
```

### 3. Type Safety with TypeScript

**Current Issue**: No type safety, prone to runtime errors.

**Recommended Solution**:
```typescript
// Create types/index.ts
export interface UploadResponse {
  success: boolean;
  message: string;
  data?: {
    filename: string;
    url?: string;
    size: number;
  };
  error?: string;
}

export interface StorageConfig {
  useS3: boolean;
  aws?: {
    accessKeyId: string;
    secretAccessKey: string;
    bucketName: string;
    region: string;
  };
}

export interface PanoramaProject {
  id: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
  files: PanoramaFile[];
}

export interface PanoramaFile {
  id: string;
  filename: string;
  originalName: string;
  size: number;
  mimeType: string;
  url: string;
  uploadedAt: Date;
}
```

### 4. API Response Standardization

**Current Issue**: Inconsistent API response formats.

**Recommended Solution**:
```javascript
// Create src/utils/apiResponse.js
export class ApiResponse {
  static success(data = null, message = 'Success') {
    return {
      success: true,
      message,
      data,
      timestamp: new Date().toISOString()
    };
  }
  
  static error(message = 'Error', statusCode = 500, details = null) {
    return {
      success: false,
      message,
      error: {
        code: statusCode,
        details
      },
      timestamp: new Date().toISOString()
    };
  }
  
  static validation(errors) {
    return this.error('Validation failed', 400, errors);
  }
}
```

## 🏗️ Architecture Improvements

### 1. Service Layer Pattern

**Create dedicated service classes**:
```javascript
// src/services/StorageService.js
export class StorageService {
  constructor(config) {
    this.config = config;
    this.client = config.useS3 ? new S3Client(config.aws) : null;
  }
  
  async upload(file, options = {}) {
    if (this.config.useS3) {
      return this.uploadToS3(file, options);
    }
    return this.uploadToLocal(file, options);
  }
  
  async delete(filename) {
    if (this.config.useS3) {
      return this.deleteFromS3(filename);
    }
    return this.deleteFromLocal(filename);
  }
  
  // Implementation methods...
}
```

### 2. Configuration Management

**Create a centralized config system**:
```javascript
// src/config/index.js
import { validateEnvironment } from './environment.js';

class Config {
  constructor() {
    validateEnvironment();
    this.storage = {
      useS3: process.env.USE_S3_STORAGE === 'true',
      maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '50000000'),
      allowedTypes: (process.env.ALLOWED_FILE_TYPES || 'image/*,application/pdf').split(','),
      aws: {
        accessKeyId: process.env.PANOR_AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.PANOR_AWS_SECRET_ACCESS_KEY,
        bucketName: process.env.PANOR_AWS_S3_BUCKET_NAME,
        region: process.env.PANOR_AWS_REGION || 'us-east-1'
      }
    };
  }
}

export const config = new Config();
```

## 🧪 Testing Strategy

### 1. Unit Tests
```javascript
// tests/services/StorageService.test.js
import { StorageService } from '../../src/services/StorageService.js';

describe('StorageService', () => {
  describe('Local Storage', () => {
    const service = new StorageService({ useS3: false });
    
    test('should upload file locally', async () => {
      const mockFile = { name: 'test.jpg', size: 1000 };
      const result = await service.upload(mockFile);
      expect(result.success).toBe(true);
    });
  });
  
  describe('S3 Storage', () => {
    // S3 tests with mocked AWS SDK
  });
});
```

### 2. Integration Tests
```javascript
// tests/api/upload.test.js
import { createMocks } from 'node-mocks-http';
import handler from '../../pages/api/upload.js';

describe('/api/upload', () => {
  test('should handle file upload', async () => {
    const { req, res } = createMocks({ method: 'POST' });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
  });
});
```

## 🔒 Security Enhancements

### 1. Input Validation
```javascript
// src/utils/validation.js
import Joi from 'joi';

export const uploadSchema = Joi.object({
  filename: Joi.string().max(255).pattern(/^[a-zA-Z0-9._-]+$/).required(),
  size: Joi.number().max(50 * 1024 * 1024).required(), // 50MB max
  mimeType: Joi.string().valid('image/jpeg', 'image/png', 'image/gif', 'application/pdf').required()
});

export function validateUpload(data) {
  const { error, value } = uploadSchema.validate(data);
  if (error) throw new Error(`Validation error: ${error.details[0].message}`);
  return value;
}
```

### 2. Rate Limiting
```javascript
// src/middleware/rateLimit.js
const rateLimitMap = new Map();

export function rateLimit(maxRequests = 10, windowMs = 60000) {
  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    const windowStart = now - windowMs;
    
    if (!rateLimitMap.has(ip)) {
      rateLimitMap.set(ip, []);
    }
    
    const requests = rateLimitMap.get(ip).filter(time => time > windowStart);
    
    if (requests.length >= maxRequests) {
      return res.status(429).json({ error: 'Too many requests' });
    }
    
    requests.push(now);
    rateLimitMap.set(ip, requests);
    next();
  };
}
```

## 📊 Performance Optimizations

### 1. Caching Strategy
```javascript
// src/utils/cache.js
class SimpleCache {
  constructor(ttl = 300000) { // 5 minutes default
    this.cache = new Map();
    this.ttl = ttl;
  }
  
  set(key, value) {
    this.cache.set(key, {
      value,
      expires: Date.now() + this.ttl
    });
  }
  
  get(key) {
    const item = this.cache.get(key);
    if (!item || Date.now() > item.expires) {
      this.cache.delete(key);
      return null;
    }
    return item.value;
  }
}

export const cache = new SimpleCache();
```

### 2. File Processing Optimization
```javascript
// src/utils/fileProcessor.js
import sharp from 'sharp';

export async function optimizeImage(buffer, options = {}) {
  const { width = 1920, quality = 80, format = 'jpeg' } = options;
  
  return sharp(buffer)
    .resize(width, null, { withoutEnlargement: true })
    .jpeg({ quality })
    .toBuffer();
}

export async function generateThumbnail(buffer, size = 200) {
  return sharp(buffer)
    .resize(size, size, { fit: 'cover' })
    .jpeg({ quality: 70 })
    .toBuffer();
}
```

## 🔄 Deployment and DevOps

### 1. Health Check Endpoint
```javascript
// pages/api/health.js
import { config } from '../../src/config/index.js';

export default function handler(req, res) {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV,
    storage: {
      type: config.storage.useS3 ? 's3' : 'local',
      configured: config.storage.useS3 ? !!config.storage.aws.bucketName : true
    }
  };
  
  res.status(200).json(health);
}
```

### 2. Monitoring and Metrics
```javascript
// src/utils/metrics.js
class Metrics {
  constructor() {
    this.counters = new Map();
    this.timers = new Map();
  }
  
  increment(name, value = 1) {
    this.counters.set(name, (this.counters.get(name) || 0) + value);
  }
  
  startTimer(name) {
    this.timers.set(name, Date.now());
  }
  
  endTimer(name) {
    const start = this.timers.get(name);
    if (start) {
      const duration = Date.now() - start;
      this.timers.delete(name);
      return duration;
    }
    return 0;
  }
  
  getMetrics() {
    return {
      counters: Object.fromEntries(this.counters),
      activeTimers: this.timers.size
    };
  }
}

export const metrics = new Metrics();
```

## 📝 Implementation Priority

1. **High Priority**:
   - Environment validation
   - Error handling and logging
   - API response standardization
   - Input validation

2. **Medium Priority**:
   - Service layer pattern
   - Configuration management
   - Basic testing setup
   - Health check endpoint

3. **Low Priority**:
   - TypeScript migration
   - Advanced caching
   - Performance optimizations
   - Comprehensive monitoring

## 🎯 Next Steps

1. Start with environment validation and error handling
2. Implement the service layer for storage operations
3. Add comprehensive input validation
4. Set up basic unit tests
5. Gradually migrate to TypeScript
6. Implement monitoring and metrics

This guide provides a roadmap for transforming the current codebase into a more maintainable, robust, and scalable application.