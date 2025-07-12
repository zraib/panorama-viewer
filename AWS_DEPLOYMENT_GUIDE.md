# AWS Deployment Guide for Panorama Viewer Application

This guide provides step-by-step instructions to deploy your Panorama Viewer application on AWS using AWS Amplify for hosting and AWS S3 for file storage.

## 📋 Prerequisites

### Required AWS Services
- **AWS Amplify** - For hosting the Next.js application
- **AWS S3** - For storing panorama images, CSV files, and configuration files
- **AWS IAM** - For managing permissions

### Required Tools
- **Node.js** 18.x or later
- **Git** for version control
- **AWS CLI** (optional, for advanced configuration)

### AWS Account Setup
1. Create an AWS account if you don't have one
2. Set up billing alerts to monitor costs
3. Note your AWS region (e.g., `us-east-1`, `eu-west-1`)

## 🚀 Step-by-Step Deployment

### Step 1: Prepare Your Application for AWS

#### 1.1 Install Required Dependencies
```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

#### 1.2 Create Environment Configuration
Create a `.env.local` file in your project root:

```env
# AWS Configuration
PANOR_AWS_REGION=us-east-1
PANOR_AWS_ACCESS_KEY_ID=your_access_key_here
PANOR_AWS_SECRET_ACCESS_KEY=your_secret_key_here
PANOR_AWS_S3_BUCKET_NAME=your-panorama-bucket-name

# Panorama Configuration
PANORAMA_CONFIG_MODE=production
PANORAMA_YAW_OFFSET=0
PANORAMA_PITCH_OFFSET=0
PANORAMA_CAMERA_OFFSET=1.6
PANORAMA_MAX_DISTANCE=50
PANORAMA_MAX_CONNECTIONS=10

# Next.js Configuration
NEXT_PUBLIC_DEV_MODE=false
NEXT_PUBLIC_SHOW_DEBUG_INFO=false

# File Upload Configuration
MAX_FILE_SIZE=50000000
MAX_FILES_PER_UPLOAD=100
UPLOAD_TIMEOUT=300000

# Use S3 for file operations
USE_S3_STORAGE=true
```

### Step 2: Create AWS S3 Bucket

#### 2.1 Create S3 Bucket
1. Go to AWS S3 Console
2. Click "Create bucket"
3. Choose a unique bucket name (e.g., `your-company-panorama-viewer`)
4. Select your preferred region
5. **Important**: Uncheck "Block all public access" for the bucket
6. Enable versioning (recommended)
7. Create the bucket

#### 2.2 Configure S3 Bucket Policy
Add this bucket policy to allow public read access to images:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "PublicReadGetObject",
            "Effect": "Allow",
            "Principal": "*",
            "Action": "s3:GetObject",
            "Resource": "arn:aws:s3:::your-bucket-name/projects/*/images/*"
        }
    ]
}
```

#### 2.3 Configure CORS for S3 Bucket
Add this CORS configuration:

```json
[
    {
        "AllowedHeaders": ["*"],
        "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
        "AllowedOrigins": ["*"],
        "ExposeHeaders": ["ETag"]
    }
]
```

### Step 3: Create IAM User for Application

#### 3.1 Create IAM User
1. Go to AWS IAM Console
2. Click "Users" → "Add users"
3. Enter username: `panorama-viewer-app`
4. Select "Programmatic access"
5. Click "Next: Permissions"

#### 3.2 Create IAM Policy
Create a custom policy with these permissions:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "s3:GetObject",
                "s3:PutObject",
                "s3:DeleteObject",
                "s3:ListBucket",
                "s3:GetObjectVersion",
                "s3:PutObjectAcl"
            ],
            "Resource": [
                "arn:aws:s3:::your-bucket-name",
                "arn:aws:s3:::your-bucket-name/*"
            ]
        }
    ]
}
```

#### 3.3 Attach Policy and Get Credentials
1. Attach the policy to your user
2. Complete user creation
3. **Important**: Save the Access Key ID and Secret Access Key

### Step 4: Deploy to AWS Amplify

#### 4.1 Push Code to Git Repository
```bash
git add .
git commit -m "Prepare for AWS deployment"
git push origin main
```

#### 4.2 Create Amplify Application
1. Go to AWS Amplify Console
2. Click "New app" → "Host web app"
3. Choose your Git provider (GitHub, GitLab, etc.)
4. Select your repository and branch
5. Amplify will auto-detect it's a Next.js app

#### 4.3 Configure Build Settings
Amplify should auto-detect the build settings, but verify they match:

```yaml
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - npm ci
        # Install Python dependencies if needed
        - |
          if command -v python3 &> /dev/null; then
            python3 -m pip install --user numpy
          elif command -v python &> /dev/null; then
            python -m pip install --user numpy
          else
            echo "Python not found, skipping numpy installation"
          fi
    build:
      commands:
        - env | grep -E "(PANORAMA_|AWS_|NEXT_PUBLIC_|MAX_|UPLOAD_|USE_)" > .env.production
        - npm run build
        # Generate any existing project configurations
        - |
          if [ -d "public" ] && [ "$(ls -A public)" ]; then
            for project_dir in public/*/; do
              if [ -d "$project_dir" ] && [ -f "${project_dir}config.json" ]; then
                project_name=$(basename "$project_dir")
                echo "Found existing project: $project_name"
                node scripts/node/generate-config.js "$project_name" || echo "Config generation failed for $project_name"
              fi
            done
          fi
  artifacts:
    baseDirectory: .next
    files:
      - '**/*'
  cache:
    paths:
      - node_modules/**/*
      - .next/cache/**/*
```

#### 4.4 Configure Environment Variables in Amplify
1. In Amplify Console, go to your app
2. Click "Environment variables" in the left sidebar
3. Add all the environment variables from your `.env.local` file:

| Variable | Value | Description |
|----------|-------|-------------|
| `PANOR_AWS_REGION` | `us-east-1` | Your AWS region |
| `PANOR_AWS_ACCESS_KEY_ID` | `your_access_key` | IAM user access key |
| `PANOR_AWS_SECRET_ACCESS_KEY` | `your_secret_key` | IAM user secret key |
| `PANOR_AWS_S3_BUCKET_NAME` | `your-bucket-name` | S3 bucket name |
| `USE_S3_STORAGE` | `true` | Enable S3 storage |
| `PANORAMA_CONFIG_MODE` | `production` | Configuration mode |
| `NEXT_PUBLIC_DEV_MODE` | `false` | Disable dev mode |
| `MAX_FILE_SIZE` | `50000000` | Max file size (50MB) |
| `MAX_FILES_PER_UPLOAD` | `100` | Max files per upload |

#### 4.5 Deploy Application
1. Click "Save and deploy"
2. Wait for the build to complete (usually 5-10 minutes)
3. Your app will be available at the Amplify-provided URL

### Step 5: Configure Custom Domain (Optional)

#### 5.1 Add Custom Domain
1. In Amplify Console, click "Domain management"
2. Click "Add domain"
3. Enter your domain name
4. Follow the DNS configuration instructions
5. Wait for SSL certificate provisioning

### Step 6: Test Your Deployment

#### 6.1 Basic Functionality Test
1. Visit your deployed application
2. Try uploading a new project with CSV and images
3. Verify files are stored in S3
4. Test panorama viewing functionality
5. Test project management (create, delete)

#### 6.2 Performance Optimization
1. Enable CloudFront distribution in Amplify
2. Configure appropriate cache headers
3. Monitor application performance

## 🔧 Configuration Options

### Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PANOR_AWS_REGION` | Yes | - | AWS region for S3 bucket |
| `PANOR_AWS_ACCESS_KEY_ID` | Yes | - | AWS access key |
| `PANOR_AWS_SECRET_ACCESS_KEY` | Yes | - | AWS secret key |
| `PANOR_AWS_S3_BUCKET_NAME` | Yes | - | S3 bucket name |
| `USE_S3_STORAGE` | No | `false` | Enable S3 storage |
| `PANORAMA_CONFIG_MODE` | No | `development` | Configuration mode |
| `PANORAMA_YAW_OFFSET` | No | `0` | Default yaw offset |
| `PANORAMA_PITCH_OFFSET` | No | `0` | Default pitch offset |
| `PANORAMA_CAMERA_OFFSET` | No | `1.6` | Camera height offset |
| `PANORAMA_MAX_DISTANCE` | No | `50` | Max connection distance |
| `PANORAMA_MAX_CONNECTIONS` | No | `10` | Max scene connections |
| `MAX_FILE_SIZE` | No | `50000000` | Max file size in bytes |
| `MAX_FILES_PER_UPLOAD` | No | `100` | Max files per upload |
| `UPLOAD_TIMEOUT` | No | `300000` | Upload timeout in ms |

### S3 Bucket Structure

Your S3 bucket will have this structure:
```
your-bucket-name/
├── projects/
│   ├── project-1/
│   │   ├── config.json
│   │   ├── data.csv
│   │   └── images/
│   │       ├── scene1-pano.jpg
│   │       ├── scene2-pano.jpg
│   │       └── ...
│   ├── project-2/
│   │   └── ...
│   └── ...
```

## 🚨 Troubleshooting

### Common Issues

#### 1. Build Failures
- **Python/NumPy errors**: Ensure Python is available in build environment
- **Memory issues**: Increase Node.js memory limit in build settings
- **Dependency issues**: Clear cache and rebuild

#### 2. S3 Access Issues
- **403 Forbidden**: Check IAM permissions and bucket policy
- **CORS errors**: Verify CORS configuration
- **File not found**: Check file paths and bucket structure

#### 3. Application Issues
- **Images not loading**: Verify S3 URLs and signed URL generation
- **Upload failures**: Check file size limits and S3 permissions
- **Configuration errors**: Verify environment variables

### Debug Steps

1. **Check Amplify build logs**:
   - Go to Amplify Console → Your app → Build history
   - Review build logs for errors

2. **Check browser console**:
   - Open browser developer tools
   - Look for network errors or JavaScript errors

3. **Verify S3 configuration**:
   - Check bucket policy and CORS settings
   - Verify IAM user permissions
   - Test S3 access with AWS CLI

4. **Test API endpoints**:
   - Use browser network tab to check API responses
   - Verify environment variables are set correctly

## 💰 Cost Estimation

### AWS Amplify
- **Build minutes**: $0.01 per build minute
- **Hosting**: $0.15 per GB served
- **Typical monthly cost**: $5-20 for small to medium usage

### AWS S3
- **Storage**: $0.023 per GB per month
- **Requests**: $0.0004 per 1,000 PUT requests
- **Data transfer**: $0.09 per GB (first 1GB free)
- **Typical monthly cost**: $1-10 for small to medium projects

### Total Estimated Cost
- **Small usage** (< 1GB storage, < 1000 requests): $5-15/month
- **Medium usage** (1-10GB storage, < 10,000 requests): $15-50/month
- **Large usage** (10-100GB storage, < 100,000 requests): $50-200/month

## 🔒 Security Best Practices

1. **Use least privilege IAM policies**
2. **Enable S3 bucket versioning**
3. **Set up CloudTrail for audit logging**
4. **Use environment variables for secrets**
5. **Enable AWS Config for compliance monitoring**
6. **Regularly rotate access keys**
7. **Monitor costs and usage**

## 📈 Monitoring and Maintenance

### Set Up Monitoring
1. **CloudWatch Alarms**: Monitor S3 usage and costs
2. **Amplify Monitoring**: Track build success rates
3. **Application Monitoring**: Use browser analytics

### Regular Maintenance
1. **Update dependencies**: Keep packages up to date
2. **Review costs**: Monitor AWS billing dashboard
3. **Clean up old files**: Implement S3 lifecycle policies
4. **Security updates**: Regularly update access keys

## 🎯 Next Steps

After successful deployment:

1. **Set up monitoring and alerts**
2. **Configure backup strategies**
3. **Implement CI/CD improvements**
4. **Optimize performance based on usage**
5. **Plan for scaling as usage grows**

Your Panorama Viewer application is now successfully deployed on AWS! 🚀