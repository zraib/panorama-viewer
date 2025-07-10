const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');

try {
  const pythonCmd = os.platform() === 'win32' ? 'python' : 'python3';

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
} catch (error) {
  console.error('Error in configuration process:', error.message);
  process.exit(1);
}