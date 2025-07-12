import { NextApiRequest, NextApiResponse } from 'next';
import { getSignedUrlForFile, fileExistsInS3 } from '../../../../utils/aws-s3';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { projectId } = req.query;
  
  if (!projectId || typeof projectId !== 'string') {
    return res.status(400).json({ error: 'Project ID is required' });
  }

  try {
    const configKey = `projects/${projectId}/config.json`;
    
    // Check if config file exists in S3
    const configExists = await fileExistsInS3(configKey);
    
    if (!configExists) {
      return res.status(404).json({ error: 'Project configuration not found' });
    }
    
    // Get signed URL for the config file
    const configUrl = await getSignedUrlForFile(configKey);
    
    // Fetch the config file content
    const configResponse = await fetch(configUrl);
    
    if (!configResponse.ok) {
      throw new Error(`Failed to fetch config: ${configResponse.statusText}`);
    }
    
    const configData = await configResponse.text();
    const config = JSON.parse(configData);
    
    // Modify the config to use S3 URLs for images
    if (config.scenes && Array.isArray(config.scenes)) {
      for (const scene of config.scenes) {
        if (scene.levels && Array.isArray(scene.levels)) {
          for (const level of scene.levels) {
            if (level.tileSize && level.size && level.fallbackOnly !== true) {
              // For tiled images, we need to update the URL template
              const imageKey = `projects/${projectId}/images/${scene.id}-pano.jpg`;
              const imageUrl = await getSignedUrlForFile(imageKey);
              
              // Update the URL template for Marzipano
              level.url = imageUrl;
            }
          }
        }
        
        // Update preview image if it exists
        if (scene.preview) {
          const previewKey = `projects/${projectId}/images/${scene.id}-preview.jpg`;
          try {
            const previewExists = await fileExistsInS3(previewKey);
            if (previewExists) {
              scene.preview = await getSignedUrlForFile(previewKey);
            }
          } catch (error) {
            console.warn(`Preview image not found for scene ${scene.id}:`, error);
          }
        }
      }
    }
    
    // Add project metadata
    const response = {
      ...config,
      projectId,
      projectPath: `/projects/${projectId}`,
      isS3: true // Flag to indicate this is served from S3
    };
    
    // Set cache headers for better performance
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
    res.status(200).json(response);
    
  } catch (error: any) {
    console.error('Config S3 API error:', error);
    
    if (error instanceof SyntaxError) {
      return res.status(400).json({ error: 'Invalid configuration file format' });
    }
    
    if (error.message?.includes('NoSuchKey') || error.message?.includes('NotFound')) {
      return res.status(404).json({ error: 'Project configuration not found' });
    }
    
    res.status(500).json({ 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}