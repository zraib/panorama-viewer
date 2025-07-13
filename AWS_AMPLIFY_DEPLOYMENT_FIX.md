# AWS Amplify Deployment Configuration Fix

## Problem Description

The deployed application at `https://aws2.d2xje7eyua81vy.amplifyapp.com/upload` shows the following error:

```
An error occurred during upload. Please try again.
📋 System Status:
 Python: ⚠️ Not available (optional)
 NumPy: ⚠️ Not available (optional)
 Public Directory: ⚠️ Not writable (optional)
 Scripts: ✅ Node.js script available
```

## Root Cause

1. **AWS Amplify Runtime Limitations**: AWS Amplify's hosting environment doesn't have Python/NumPy available at runtime
2. **Environment Variable Access**: Next.js SSR functions need explicit configuration to access environment variables at runtime
3. **Storage Configuration**: The app was trying to use local storage mode instead of S3 storage mode

## Solution Applied

### 1. Updated `next.config.js`

Added explicit environment variable exposure for server-side runtime:

```javascript
env: {
  USE_S3_STORAGE: process.env.USE_S3_STORAGE,
  PANOR_AWS_ACCESS_KEY_ID: process.env.PANOR_AWS_ACCESS_KEY_ID,
  PANOR_AWS_SECRET_ACCESS_KEY: process.env.PANOR_AWS_SECRET_ACCESS_KEY,
  PANOR_AWS_S3_BUCKET_NAME: process.env.PANOR_AWS_S3_BUCKET_NAME,
  PANOR_AWS_REGION: process.env.PANOR_AWS_REGION,
  NODE_ENV: process.env.NODE_ENV,
},
```

### 2. Updated `amplify.yml`

- Removed Python/NumPy installation attempts (not available in Amplify runtime)
- Simplified environment variable handling for Next.js SSR
- Focused on S3 storage configuration

### 3. Updated `.env`

Enabled S3 storage mode: `USE_S3_STORAGE=true`

## Required AWS Amplify Console Configuration

You need to set these environment variables in the AWS Amplify Console:

### Navigate to: App Settings > Environment Variables

Add the following variables:

| Variable Name | Value | Description |
|---------------|-------|-------------|
| `USE_S3_STORAGE` | `true` | Enable S3 storage mode |
| `PANOR_AWS_ACCESS_KEY_ID` | `your_actual_access_key` | AWS Access Key ID |
| `PANOR_AWS_SECRET_ACCESS_KEY` | `your_actual_secret_key` | AWS Secret Access Key |
| `PANOR_AWS_S3_BUCKET_NAME` | `your_bucket_name` | S3 Bucket Name |
| `PANOR_AWS_REGION` | `us-east-1` | AWS Region |
| `NODE_ENV` | `production` | Node Environment |

### Important Notes:

1. **Security**: Never commit actual AWS credentials to your repository
2. **IAM Permissions**: Ensure your AWS credentials have the following S3 permissions:
   - `s3:GetObject`
   - `s3:PutObject`
   - `s3:DeleteObject`
   - `s3:ListBucket`

## Deployment Steps

1. **Commit and Push Changes**:
   ```bash
   git add .
   git commit -m "Fix AWS Amplify deployment configuration for S3 storage"
   git push origin aws2
   ```

2. **Configure Environment Variables in AWS Amplify Console**:
   - Go to your Amplify app in AWS Console
   - Navigate to "App Settings" > "Environment Variables"
   - Add all the variables listed above with your actual AWS credentials

3. **Trigger Redeploy**:
   - The push will automatically trigger a new deployment
   - Or manually trigger redeploy from the Amplify console

## Verification

After deployment, the system status should show:

```
📋 System Status:
 Python: ⚠️ Not available (optional) ← This is expected in S3 mode
 NumPy: ⚠️ Not available (optional) ← This is expected in S3 mode
 Public Directory: ⚠️ Not writable (optional) ← This is expected in S3 mode
 Scripts: ✅ Node.js script available
 S3 Storage: ✅ Configured and accessible
```

## Troubleshooting

### If upload still fails:

1. **Check Environment Variables**: Verify all environment variables are set correctly in Amplify console
2. **Check AWS Credentials**: Ensure credentials have proper S3 permissions
3. **Check S3 Bucket**: Verify bucket exists and is accessible
4. **Check CloudWatch Logs**: Look for detailed error messages in Amplify function logs

### Common Issues:

- **403 Forbidden**: Check IAM permissions for S3 bucket access
- **404 Not Found**: Verify S3 bucket name and region are correct
- **Environment variables not found**: Ensure variables are set in Amplify console and app is redeployed

## Architecture Notes

With this configuration:
- **Local Development**: Can use either local storage (with Python/NumPy) or S3 storage
- **AWS Amplify Production**: Uses S3 storage exclusively (Python/NumPy not required)
- **Configuration Generation**: Handled by Node.js scripts at runtime via API calls
- **File Storage**: All uploads go directly to S3 bucket