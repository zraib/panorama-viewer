import { NextApiRequest, NextApiResponse } from 'next';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { isS3StorageEnabled, validateStorageConfig, getStorageDebugInfo } from '../../utils/storage-config';

const execAsync = promisify(exec);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const isS3Enabled = isS3StorageEnabled();
  const storageConfig = validateStorageConfig();
  const storageDebug = getStorageDebugInfo();

  const diagnostics = {
    timestamp: new Date().toISOString(),
    storage: {
      type: isS3Enabled ? 's3' : 'local',
      s3Enabled: isS3Enabled,
      configValid: storageConfig.isValid,
      configErrors: storageConfig.errors,
    },
    system: {
      platform: os.platform(),
      arch: os.arch(),
      nodeVersion: process.version,
      cwd: process.cwd(),
    },
    python: {
      available: false,
      version: null as string | null,
      error: null as string | null,
      required: !isS3Enabled, // Python only required for local storage
    },
    numpy: {
      available: false,
      version: null as string | null,
      error: null as string | null,
      required: !isS3Enabled, // NumPy only required for local storage
    },
    directories: {
      public: {
        exists: false,
        writable: false,
        path: '',
        required: !isS3Enabled, // Local directories only required for local storage
      },
      tmp: {
        exists: false,
        writable: false,
        path: '',
        required: !isS3Enabled,
      },
      scripts: {
        nodeScript: {
          exists: false,
          path: '',
        },
        pythonScript: {
          exists: false,
          path: '',
          required: !isS3Enabled, // Python script only required for local storage
        },
      },
    },
    recommendations: [] as string[],
  };

  // Check Python availability (only if required for local storage)
  if (diagnostics.python.required) {
    try {
      const pythonCmd = os.platform() === 'win32' ? 'python' : 'python3';
      const { stdout } = await execAsync(`${pythonCmd} --version`);
      diagnostics.python.available = true;
      diagnostics.python.version = stdout.trim();
    } catch (error: any) {
      diagnostics.python.error = error.message;
      diagnostics.recommendations.push('Install Python 3.7 or higher (required for local storage)');
    }
  } else {
    // For S3 storage, Python is optional
    try {
      const pythonCmd = os.platform() === 'win32' ? 'python' : 'python3';
      const { stdout } = await execAsync(`${pythonCmd} --version`);
      diagnostics.python.available = true;
      diagnostics.python.version = stdout.trim();
    } catch (error: any) {
      diagnostics.python.error = error.message;
      // No recommendation needed for S3 storage
    }
  }

  // Check numpy availability (only if required for local storage)
  if (diagnostics.numpy.required) {
    if (diagnostics.python.available) {
      try {
        const pythonCmd = os.platform() === 'win32' ? 'python' : 'python3';
        const { stdout } = await execAsync(`${pythonCmd} -c "import numpy; print(numpy.__version__)"`); 
        diagnostics.numpy.available = true;
        diagnostics.numpy.version = stdout.trim();
      } catch (error: any) {
        diagnostics.numpy.error = error.message;
        diagnostics.recommendations.push('Install numpy: pip install numpy (required for local storage)');
      }
    }
  } else {
    // For S3 storage, NumPy is optional
    if (diagnostics.python.available) {
      try {
        const pythonCmd = os.platform() === 'win32' ? 'python' : 'python3';
        const { stdout } = await execAsync(`${pythonCmd} -c "import numpy; print(numpy.__version__)"`); 
        diagnostics.numpy.available = true;
        diagnostics.numpy.version = stdout.trim();
      } catch (error: any) {
        diagnostics.numpy.error = error.message;
        // No recommendation needed for S3 storage
      }
    }
  }

  // Check S3 configuration if S3 storage is enabled
  if (isS3Enabled && !storageConfig.isValid) {
    diagnostics.recommendations.push(...storageConfig.errors.map(error => `S3 Configuration: ${error}`));
  }

  // Check directories (only if required for local storage)
  const publicDir = path.join(process.cwd(), 'public');
  diagnostics.directories.public.path = publicDir;
  diagnostics.directories.public.exists = fs.existsSync(publicDir);
  
  if (diagnostics.directories.public.required) {
    if (diagnostics.directories.public.exists) {
      try {
        const testFile = path.join(publicDir, '.write-test');
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
        diagnostics.directories.public.writable = true;
      } catch (error) {
        diagnostics.recommendations.push('Ensure write permissions for the public directory (required for local storage)');
      }
    } else {
      diagnostics.recommendations.push('Create public directory (required for local storage)');
    }
  } else {
    // For S3 storage, check if directory exists but don't require write permissions
    if (diagnostics.directories.public.exists) {
      try {
        const testFile = path.join(publicDir, '.write-test');
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
        diagnostics.directories.public.writable = true;
      } catch (error) {
        // Not critical for S3 storage
      }
    }
  }

  const tmpDir = path.join(process.cwd(), 'tmp');
  diagnostics.directories.tmp.path = tmpDir;
  diagnostics.directories.tmp.exists = fs.existsSync(tmpDir);
  
  if (diagnostics.directories.tmp.required) {
    if (diagnostics.directories.tmp.exists) {
      try {
        const testFile = path.join(tmpDir, '.write-test');
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
        diagnostics.directories.tmp.writable = true;
      } catch (error) {
        diagnostics.recommendations.push('Ensure write permissions for the tmp directory (required for local storage)');
      }
    } else {
      diagnostics.recommendations.push('Create tmp directory (required for local storage)');
    }
  } else {
    // For S3 storage, tmp directory is still useful for temporary processing
    if (diagnostics.directories.tmp.exists) {
      try {
        const testFile = path.join(tmpDir, '.write-test');
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
        diagnostics.directories.tmp.writable = true;
      } catch (error) {
        // Not critical for S3 storage
      }
    }
  }

  // Check script files
  const nodeScriptPath = path.join(process.cwd(), 'scripts', 'node', 'generate-config.js');
  diagnostics.directories.scripts.nodeScript.path = nodeScriptPath;
  diagnostics.directories.scripts.nodeScript.exists = fs.existsSync(nodeScriptPath);
  
  if (!diagnostics.directories.scripts.nodeScript.exists) {
    diagnostics.recommendations.push('Node.js configuration script is missing');
  }

  const pythonScriptPath = path.join(process.cwd(), 'scripts', 'python', 'generate_marzipano_config.py');
  diagnostics.directories.scripts.pythonScript.path = pythonScriptPath;
  diagnostics.directories.scripts.pythonScript.exists = fs.existsSync(pythonScriptPath);
  
  if (diagnostics.directories.scripts.pythonScript.required && !diagnostics.directories.scripts.pythonScript.exists) {
    diagnostics.recommendations.push('Python configuration script is missing (required for local storage)');
  }

  // Overall health check - different criteria for S3 vs local storage
  let isHealthy: boolean;
  
  if (isS3Enabled) {
    // For S3 storage: require valid S3 config and Node.js script
    isHealthy = 
      storageConfig.isValid &&
      diagnostics.directories.scripts.nodeScript.exists;
  } else {
    // For local storage: require Python, NumPy, directories, and scripts
    isHealthy = 
      diagnostics.python.available &&
      diagnostics.numpy.available &&
      diagnostics.directories.public.exists &&
      diagnostics.directories.public.writable &&
      diagnostics.directories.scripts.nodeScript.exists &&
      diagnostics.directories.scripts.pythonScript.exists;
  }

  // Generate summary based on storage type
  const summary = {
    storage: isS3Enabled ? '✅ S3 Storage' : '✅ Local Storage',
    python: diagnostics.python.required 
      ? (diagnostics.python.available ? '✅ Available' : '❌ Not available')
      : (diagnostics.python.available ? '✅ Available (optional)' : '⚠️ Not available (optional)'),
    numpy: diagnostics.numpy.required 
      ? (diagnostics.numpy.available ? '✅ Available' : '❌ Not available')
      : (diagnostics.numpy.available ? '✅ Available (optional)' : '⚠️ Not available (optional)'),
    publicDir: diagnostics.directories.public.required 
      ? (diagnostics.directories.public.writable ? '✅ Writable' : '❌ Not writable')
      : (diagnostics.directories.public.writable ? '✅ Writable (optional)' : '⚠️ Not writable (optional)'),
    scripts: diagnostics.directories.scripts.nodeScript.exists 
      ? (diagnostics.directories.scripts.pythonScript.required 
          ? (diagnostics.directories.scripts.pythonScript.exists ? '✅ Available' : '❌ Missing Python script')
          : '✅ Node.js script available')
      : '❌ Missing Node.js script',
  };

  if (isS3Enabled) {
    summary['s3Config'] = storageConfig.isValid ? '✅ Valid' : '❌ Invalid';
  }

  res.status(200).json({
    healthy: isHealthy,
    diagnostics,
    summary,
    storageInfo: storageDebug,
  });
}