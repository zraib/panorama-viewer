# S3 Integration Summary

This document summarizes the S3 integration work completed for the Panorama Viewer application.

## Files Created/Modified

### New S3-Compatible API Routes
1. **`src/pages/api/upload-s3.ts`** - S3-compatible file upload handler
2. **`src/pages/api/projects-s3.ts`** - S3-compatible project management
3. **`src/pages/api/projects/[projectId]/config-s3.ts`** - S3-compatible configuration serving
4. **`src/pages/api/projects/[projectId]/upload-s3.ts`** - S3-compatible project file uploads
5. **`src/pages/api/projects/[projectId]/images/[...path].ts`** - S3 image serving with signed URLs
6. **`src/pages/api/files-s3/[...path].ts`** - S3-compatible file serving for POI attachments

### Storage Configuration Utility
7. **`src/utils/storage-config.ts`** - Central utility for storage-aware API routing

### Updated Components
8. **`src/hooks/usePanoramaManager.ts`** - Updated to use storage-aware configuration URLs
9. **`src/pages/[projectId]/[sceneId].tsx`** - Updated to use storage-aware APIs
10. **`src/pages/index.tsx`** - Updated to use storage-aware project and image APIs
11. **`src/pages/upload.tsx`** - Updated to use storage-aware upload and project APIs
12. **`src/components/poi/POIPreview.tsx`** - Updated to use storage-aware file URLs

### Documentation
13. **`AWS_DEPLOYMENT_GUIDE.md`** - Comprehensive deployment guide for AWS

## Key Features Implemented

### Environment-Based Storage Switching
- The application automatically switches between local and S3 storage based on the `USE_S3_STORAGE` environment variable
- All API calls use storage-aware utilities that route to the appropriate endpoints

### S3 Integration Features
- **File Upload**: Direct upload to S3 with duplicate handling and cleanup
- **Project Management**: S3-based project listing, creation, and deletion
- **Configuration Serving**: S3-based config.json serving with URL rewriting
- **Image Serving**: Signed URL generation for secure S3 image access
- **File Serving**: POI attachment serving through S3 signed URLs

### Security & Performance
- **Signed URLs**: All S3 file access uses time-limited signed URLs (1 hour expiry)
- **Error Handling**: Comprehensive error handling for S3 operations
- **CORS Support**: Proper CORS headers for cross-origin requests
- **File Validation**: File type and size validation before upload

## Environment Variables Required

For S3 integration, set these environment variables:

```env
# Enable S3 storage
USE_S3_STORAGE=true

# AWS Configuration
PANOR_AWS_REGION=us-east-1
PANOR_AWS_ACCESS_KEY_ID=your_access_key
PANOR_AWS_SECRET_ACCESS_KEY=your_secret_key
PANOR_AWS_S3_BUCKET_NAME=your_bucket_name

# Optional: Public versions for client-side access
NEXT_PUBLIC_PANOR_AWS_REGION=us-east-1
NEXT_PUBLIC_PANOR_AWS_S3_BUCKET_NAME=your_bucket_name
```

## Storage Structure

### S3 Bucket Structure
```
projects/
├── project-id-1/
│   ├── config.json
│   ├── images/
│   │   ├── scene1-pano.jpg
│   │   ├── scene2-pano.jpg
│   │   └── ...
│   └── data/
│       └── poi/
│           └── attachments/
│               └── ...
└── project-id-2/
    └── ...
```

### Local Storage Structure (Fallback)
```
public/
├── project-id-1/
│   ├── config.json
│   ├── images/
│   └── data/
└── project-id-2/
    └── ...
```

## API Route Mapping

| Feature | Local Route | S3 Route |
|---------|-------------|----------|
| Projects | `/api/projects` | `/api/projects-s3` |
| Upload | `/api/projects/[id]/upload` | `/api/projects/[id]/upload-s3` |
| Config | `/api/projects/[id]/config` | `/api/projects/[id]/config-s3` |
| Images | `/{projectId}/images/{path}` | `/api/projects/[id]/images/{path}` |
| Files | `/api/files/{path}` | `/api/files-s3/{path}` |

## Backward Compatibility

- **Local Storage**: All existing functionality remains intact when `USE_S3_STORAGE=false`
- **POI System**: Continues to use local storage regardless of main storage setting
- **Configuration**: Seamless switching between storage types without code changes

## Testing

1. **Local Mode**: Set `USE_S3_STORAGE=false` and test all functionality
2. **S3 Mode**: Set `USE_S3_STORAGE=true` with proper AWS credentials and test:
   - Project creation and upload
   - Image viewing and navigation
   - Configuration loading
   - POI attachment viewing

## Deployment Notes

- Ensure AWS credentials have proper S3 permissions (read, write, delete)
- Configure CORS on S3 bucket for web access
- Set appropriate bucket policies for security
- Monitor S3 costs and implement lifecycle policies if needed
- Consider CloudFront CDN for better performance

The integration is complete and ready for deployment to AWS infrastructure.