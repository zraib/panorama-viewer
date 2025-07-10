const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');

// Function to check if Python and numpy are available
function checkPythonDependencies() {
  const pythonCmd = os.platform() === 'win32' ? 'python' : 'python3';
  
  try {
    // Check if Python is available
    execSync(`${pythonCmd} --version`, { stdio: 'pipe' });
    
    // Check if numpy is available
    execSync(`${pythonCmd} -c "import numpy; print('numpy available')"`, { stdio: 'pipe' });
    
    return { success: true, pythonCmd };
  } catch (error) {
    return { success: false, pythonCmd, error: error.message };
  }
}

try {
  // Check dependencies first
  const depCheck = checkPythonDependencies();
  if (!depCheck.success) {
    console.error('❌ Python dependency check failed:');
    console.error('Error:', depCheck.error);
    console.error('\n💡 To fix this issue:');
    console.error('1. Make sure Python is installed and available in PATH');
    console.error('2. Install numpy: pip install numpy');
    console.error('3. Or run: npm run postinstall');
    console.error('4. Check the requirements.txt file for all dependencies');
    throw new Error('Python or required packages (numpy) are not installed');
  }
  
  const pythonCmd = depCheck.pythonCmd;

  // Parse command line arguments
  const args = process.argv.slice(2);
  const projectIndex = args.indexOf('--project');
  const projectId =
    projectIndex !== -1 && projectIndex + 1 < args.length
      ? args[projectIndex + 1]
      : null;

  if (!projectId) {
    throw new Error(
      'Project ID is required. Use --project <projectId> argument.'
    );
  }

  console.log(`Generating panorama configuration for project: ${projectId}`);

  // Generate config for specific project
  const output1 = execSync(
    `${pythonCmd} scripts/python/generate_marzipano_config.py --project "${projectId}"`,
    {
      encoding: 'utf8',
      cwd: process.cwd(),
    }
  );
  console.log(output1);

  const configPath = `public/${projectId}/config.json`;
  if (!fs.existsSync(configPath)) {
    throw new Error(`config.json was not generated at ${configPath}`);
  }

  console.log(`Configuration generated successfully at ${configPath}`);

  console.log('Calculating north offsets...');
  const output2 = execSync(
    `${pythonCmd} scripts/python/calculate_north_offsets.py --project "${projectId}"`,
    {
      encoding: 'utf8',
      cwd: process.cwd(),
    }
  );
  console.log(output2);

  console.log('North offsets calculated and applied successfully');
  console.log('✅ Configuration generation completed successfully!');
} catch (error) {
  console.error('❌ Error in configuration process:', error.message);
  
  // Provide specific guidance based on error type
  if (error.message.includes('Python') || error.message.includes('numpy')) {
    console.error('\n🔧 Python/NumPy installation help:');
    console.error('- Windows: pip install numpy');
    console.error('- Linux/Mac: pip3 install numpy');
    console.error('- Or run: npm run postinstall');
  } else if (error.message.includes('pano-poses.csv')) {
    console.error('\n📁 File structure help:');
    console.error(`- Make sure public/${process.argv[process.argv.indexOf('--project') + 1]}/data/pano-poses.csv exists`);
    console.error('- Check that files were uploaded correctly');
  }
  
  process.exit(1);
}