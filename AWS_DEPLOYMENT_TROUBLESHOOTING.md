# AWS Deployment Troubleshooting Guide

## 🚨 Current Issues Identified

You're experiencing these specific deployment errors:
- **Python: ❌ Not available**
- **NumPy: ❌ Not available** 
- **Public Directory: ❌ Not writable**
- **Scripts: ❌ Missing**

## 🔧 Immediate Solutions

### 1. **Fixed Amplify Build Configuration**

I've updated your `amplify.yml` file with improved Python dependency handling:

**Key Changes Made:**
- ✅ Better Python detection logic (`python3` vs `python`)
- ✅ Proper user-space pip installation (`--user` flag)
- ✅ Environment variable filtering for production
- ✅ Conditional project configuration generation
- ✅ Graceful fallbacks when Python is unavailable

### 2. **Environment Variables Setup**

In your **AWS Amplify Console**, add these environment variables:

| Variable | Value | Required |
|----------|-------|----------|
| `USE_S3_STORAGE` | `true` | ✅ |
| `PANOR_AWS_REGION` | `us-east-1` (or your region) | ✅ |
| `PANOR_AWS_ACCESS_KEY_ID` | Your AWS access key | ✅ |
| `PANOR_AWS_SECRET_ACCESS_KEY` | Your AWS secret key | ✅ |
| `PANOR_AWS_S3_BUCKET_NAME` | Your S3 bucket name | ✅ |
| `NEXT_PUBLIC_PANOR_AWS_S3_BUCKET_NAME` | Your S3 bucket name | ✅ |
| `NEXT_PUBLIC_PANOR_AWS_REGION` | `us-east-1` (or your region) | ✅ |
| `PANORAMA_CONFIG_MODE` | `production` | ⚠️ |
| `MAX_FILE_SIZE` | `50000000` | ⚠️ |
| `MAX_FILES_PER_UPLOAD` | `100` | ⚠️ |

**How to Add Environment Variables:**
1. Go to AWS Amplify Console
2. Select your app
3. Click "Environment variables" in left sidebar
4. Click "Manage variables"
5. Add each variable above
6. Click "Save"

### 3. **Understanding the Serverless Environment**

**Why These Errors Occur:**
- **Python/NumPy**: AWS Amplify build environment may not have Python pre-installed
- **Public Directory**: Serverless environments have read-only file systems at runtime
- **Scripts Missing**: Build process may not include all required files

**How the App Actually Works:**
- ✅ **Node.js Implementation**: Your app has a complete Node.js implementation that doesn't require Python
- ✅ **S3 Storage**: Files are stored in S3, not local directories
- ✅ **Runtime Generation**: Configuration is generated at runtime, not build time

## 🚀 Deployment Steps

### Step 1: Commit and Push Changes
```bash
git add .
git commit -m "Fix AWS deployment configuration"
git push origin main
```

### Step 2: Trigger New Build
1. Go to AWS Amplify Console
2. Click "Run build" or wait for automatic deployment
3. Monitor build logs for improvements

### Step 3: Verify S3 Configuration
Ensure your S3 bucket has:
- ✅ Public read access for images
- ✅ CORS configuration
- ✅ Proper IAM permissions

## 🔍 Understanding the Error Messages

### "Python: ❌ Not available"
**What it means**: The diagnostics API is checking for Python in the runtime environment
**Why it happens**: AWS Lambda/Amplify runtime doesn't include Python by default
**Solution**: The app uses Node.js alternatives automatically

### "NumPy: ❌ Not available"
**What it means**: Python NumPy package not found
**Why it happens**: No Python = No NumPy
**Solution**: Node.js implementation handles all math operations

### "Public Directory: ❌ Not writable"
**What it means**: Cannot write to local `public/` directory
**Why it happens**: Serverless environments have read-only file systems
**Solution**: S3 storage handles all file operations

### "Scripts: ❌ Missing"
**What it means**: Python scripts not found in runtime
**Why it happens**: Build process may not include Python files
**Solution**: Node.js scripts handle all functionality

## ✅ Expected Behavior After Fix

After implementing these fixes, your app should:

1. **Build Successfully**: No more Python dependency errors
2. **Use S3 Storage**: All files stored in AWS S3
3. **Generate Configs**: Node.js handles configuration generation
4. **Handle Uploads**: Files uploaded directly to S3
5. **Serve Images**: Images served from S3 with signed URLs

## 🧪 Testing Your Deployment

### 1. **Test Upload Functionality**
```bash
# After deployment, test these features:
1. Visit your Amplify app URL
2. Go to /upload page
3. Try uploading a project with CSV + images
4. Verify files appear in S3 bucket
5. Check panorama viewing works
```

### 2. **Check S3 Bucket Structure**
Your S3 bucket should show:
```
your-bucket-name/
├── projects/
│   └── your-project-name/
│       ├── config.json
│       ├── data/
│       │   └── pano-poses.csv
│       └── images/
│           ├── image1.jpg
│           └── image2.jpg
```

### 3. **Verify Environment Variables**
Check that all required environment variables are set in Amplify Console.

## 🚨 If Issues Persist

### Check Build Logs
1. Go to Amplify Console → Your App → Build history
2. Click on latest build
3. Expand "Build" phase logs
4. Look for Python installation messages

### Common Build Log Messages (Normal):
```
✅ "Python3 and NumPy installed successfully"
✅ "Python not found, using Node.js alternatives"
✅ "No existing projects found, skipping config generation"
```

### Problematic Build Log Messages:
```
❌ "npm ci failed"
❌ "npm run build failed"
❌ "Environment variable not found"
```

## 🔄 Alternative Solutions

### Option 1: Force Node.js Only
Add this environment variable to completely bypass Python:
```
FORCE_NODEJS_CONFIG=true
```

### Option 2: Custom Build Image
If Python is absolutely required, use a custom build image:
```yaml
# In amplify.yml
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - yum install -y python3 python3-pip
        - python3 -m pip install numpy
        - npm ci
```

## 📞 Getting Help

If you continue experiencing issues:

1. **Check AWS Amplify Documentation**: [AWS Amplify Build Settings](https://docs.aws.amazon.com/amplify/latest/userguide/build-settings.html)
2. **Review S3 Permissions**: Ensure IAM user has proper S3 access
3. **Monitor Costs**: Check AWS billing to ensure services are running
4. **Test Locally**: Verify the app works with `USE_S3_STORAGE=true` locally

## 🎯 Success Indicators

Your deployment is successful when:
- ✅ Build completes without errors
- ✅ App loads at Amplify URL
- ✅ Upload page accepts files
- ✅ Files appear in S3 bucket
- ✅ Panoramas display correctly
- ✅ No console errors in browser

The updated configuration should resolve all the deployment issues you're experiencing! 🚀