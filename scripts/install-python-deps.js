#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');

console.log('🐍 Installing Python dependencies for Panorama Viewer...');

// Check if requirements.txt exists
if (!fs.existsSync('requirements.txt')) {
  console.error('❌ requirements.txt not found in project root');
  process.exit(1);
}

const pythonCommands = os.platform() === 'win32' 
  ? ['python', 'py'] 
  : ['python3', 'python'];

let success = false;

for (const pythonCmd of pythonCommands) {
  try {
    console.log(`Trying ${pythonCmd}...`);
    
    // Check if Python is available
    const version = execSync(`${pythonCmd} --version`, { encoding: 'utf8' }).trim();
    console.log(`✅ Found ${version}`);
    
    // Install dependencies
    console.log('📦 Installing dependencies from requirements.txt...');
    execSync(`${pythonCmd} -m pip install -r requirements.txt`, { 
      stdio: 'inherit',
      encoding: 'utf8'
    });
    
    // Verify numpy installation
    execSync(`${pythonCmd} -c "import numpy; print('NumPy version:', numpy.__version__)"`, {
      stdio: 'inherit',
      encoding: 'utf8'
    });
    
    console.log('✅ Python dependencies installed successfully!');
    success = true;
    break;
    
  } catch (error) {
    console.log(`❌ ${pythonCmd} failed: ${error.message}`);
    continue;
  }
}

if (!success) {
  console.error('\n❌ Failed to install Python dependencies');
  console.error('\n💡 Manual installation steps:');
  console.error('1. Make sure Python 3.7+ is installed');
  console.error('2. Run: pip install numpy');
  console.error('3. Or: python -m pip install -r requirements.txt');
  process.exit(1);
}

console.log('\n🎉 Setup complete! You can now run configuration generation.');