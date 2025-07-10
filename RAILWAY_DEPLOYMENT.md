# Railway Deployment Guide

## 🚂 Railway Deployment Setup

This guide explains how to deploy the Panorama Viewer application to Railway with proper Python and Node.js support.

## 📋 Prerequisites

The application requires both Node.js and Python environments:
- **Node.js** 18.x or later
- **Python** 3.8 or later with NumPy

## 🔧 Deployment Files

The following files have been created to support Railway deployment:

### 1. `requirements.txt`
Specifies Python dependencies:
```
numpy>=1.21.0
```

### 2. `railway.json`
Railway-specific configuration:
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "pip install -r requirements.txt && npm ci && npm run build"
  },
  "deploy": {
    "startCommand": "npm start",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

### 3. `Dockerfile` (Alternative)
For Docker-based deployment:
- Uses Node.js 18 with Python support
- Installs Python dependencies
- Builds and runs the Next.js application

## 🚀 Deployment Steps

### Option 1: Using Railway.json (Recommended)

1. **Push the updated code** to your repository:
   ```bash
   git add .
   git commit -m "Add Railway deployment configuration"
   git push
   ```

2. **Redeploy on Railway**:
   - Go to your Railway dashboard
   - Click "Deploy" or trigger a new deployment
   - Railway will use the `railway.json` configuration

### Option 2: Using Dockerfile

1. **Set Railway to use Docker**:
   - In Railway dashboard, go to Settings
   - Set "Build Method" to "Dockerfile"
   - Redeploy the application

## 🔍 Troubleshooting

### Error: "Python or required packages (numpy) are not installed"

**Solution**: The deployment files created above should resolve this issue by:
- Installing Python dependencies before building
- Ensuring NumPy is available during configuration generation

### Manual Configuration Generation

If the automatic configuration generation fails, you can run it manually:

```bash
node scripts/node/generate-config.js --project "your-project-name"
```

### Environment Variables

Set these environment variables in Railway dashboard if needed:

```env
# Panorama Configuration
PANORAMA_CONFIG_MODE=standard
PANORAMA_YAW_OFFSET=0
PANORAMA_PITCH_OFFSET=0
PANORAMA_CAMERA_OFFSET=1.2
PANORAMA_MAX_DISTANCE=10.0
PANORAMA_MAX_CONNECTIONS=6

# Production Settings
NEXT_PUBLIC_DEV_MODE=false
NEXT_PUBLIC_SHOW_DEBUG_INFO=false
NODE_ENV=production
```

## 📝 Notes

- The build process installs Python dependencies first, then Node.js dependencies
- Configuration generation happens during the build phase
- The application will restart automatically if it fails
- Both Python and Node.js environments are available during runtime

## 🆘 Support

If you continue to experience deployment issues:

1. Check Railway build logs for specific error messages
2. Verify that both `requirements.txt` and `railway.json` are in the root directory
3. Ensure your repository includes all the deployment files
4. Try the Dockerfile approach if Nixpacks fails

## 🔄 Next Steps

After successful deployment:

1. Test the upload functionality with a sample project
2. Verify that configuration generation works correctly
3. Check that all panorama features are working as expected