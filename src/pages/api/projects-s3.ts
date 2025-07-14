import { NextApiRequest, NextApiResponse } from 'next';
import { listFilesInS3, deleteFileFromS3, fileExistsInS3, getSignedUrlForFile } from '../../utils/aws-s3';

interface Project {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  sceneCount: number;
  hasConfig: boolean;
}

interface S3Object {
  Key: string;
  LastModified: Date;
  Size: number;
}

const getProjectInfo = async (projectId: string): Promise<Project | null> => {
  try {
    // Check if project has any files
    const projectFiles = await listFilesInS3(`projects/${projectId}/`);
    
    if (projectFiles.length === 0) {
      return null;
    }
    
    // Check for config file
    const hasConfig = await fileExistsInS3(`projects/${projectId}/config.json`);
    
    let sceneCount = 0;
    if (hasConfig) {
      try {
        // In a real implementation, you'd download and parse the config
        // For now, we'll estimate based on image files
        const imageFiles = projectFiles.filter(key => 
          key.includes('/images/') && 
          (key.endsWith('.jpg') || key.endsWith('.jpeg') || key.endsWith('.png'))
        );
        sceneCount = imageFiles.length;
      } catch {
        sceneCount = 0;
      }
    }
    
    // Get creation and modification dates from the oldest and newest files
    const fileDates = projectFiles.map(key => {
      // Extract timestamp from S3 key if it follows our naming convention
      const match = key.match(/(\d{13})_/);
      return match ? new Date(parseInt(match[1])) : new Date();
    });
    
    const createdAt = fileDates.length > 0 ? new Date(Math.min(...fileDates.map(d => d.getTime()))) : new Date();
    const updatedAt = fileDates.length > 0 ? new Date(Math.max(...fileDates.map(d => d.getTime()))) : new Date();
    
    return {
      id: projectId,
      name: projectId,
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
      sceneCount,
      hasConfig
    };
  } catch (error) {
    console.error(`Error getting project info for ${projectId}:`, error);
    return null;
  }
};

const deleteProjectFromS3 = async (projectId: string): Promise<void> => {
  try {
    const projectFiles = await listFilesInS3(`projects/${projectId}/`);
    
    // Delete all files in the project
    for (const fileKey of projectFiles) {
      await deleteFileFromS3(fileKey);
    }
    
    console.log(`Deleted ${projectFiles.length} files for project ${projectId}`);
  } catch (error) {
    console.error(`Error deleting project ${projectId}:`, error);
    throw error;
  }
};

const getUniqueProjectIds = (fileKeys: string[]): string[] => {
  const projectIds = new Set<string>();
  
  for (const key of fileKeys) {
    // Extract project ID from S3 key pattern: projects/{projectId}/...
    const match = key.match(/^projects\/([^/]+)\//); 
    if (match) {
      projectIds.add(match[1]);
    }
  }
  
  return Array.from(projectIds);
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req;
  
  try {
    switch (method) {
      case 'GET':
        // List all projects from S3
        try {
          const allFiles = await listFilesInS3('projects/');
          const projectIds = getUniqueProjectIds(allFiles);
          
          const projects: Project[] = [];
          
          for (const projectId of projectIds) {
            const projectInfo = await getProjectInfo(projectId);
            if (projectInfo) {
              projects.push(projectInfo);
            }
          }
          
          // Sort by updated date (newest first)
          projects.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
          
          res.status(200).json({ projects });
        } catch (error: any) {
          console.error('Error listing projects from S3:', {
            name: error.name,
            message: error.message,
            code: error.code,
            statusCode: error.$metadata?.httpStatusCode,
            requestId: error.$metadata?.requestId,
            stack: error.stack
          });
          res.status(500).json({ 
            error: 'Failed to list projects from S3',
            awsError: {
              name: error.name,
              message: error.message,
              code: error.code,
              statusCode: error.$metadata?.httpStatusCode
            },
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
           });
        break;
        
      case 'POST':
        // Create a new project (just validate name, actual creation happens on upload)
        const { projectName } = req.body;
        
        if (!projectName || typeof projectName !== 'string') {
          return res.status(400).json({ error: 'Project name is required' });
        }
        
        // Sanitize project name
        const sanitizedName = projectName.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
        
        if (!sanitizedName) {
          return res.status(400).json({ error: 'Invalid project name' });
        }
        
        // Check if project already exists in S3
        try {
          const existingFiles = await listFilesInS3(`projects/${sanitizedName}/`);
          
          if (existingFiles.length > 0) {
            return res.status(409).json({ error: 'Project already exists' });
          }
          
          // Return project info (will be empty until files are uploaded)
          const newProject: Project = {
            id: sanitizedName,
            name: sanitizedName,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            sceneCount: 0,
            hasConfig: false
          };
          
          res.status(201).json({ project: newProject });
        } catch (error: any) {
          console.error('Error checking project existence in S3:', {
            name: error.name,
            message: error.message,
            code: error.code,
            statusCode: error.$metadata?.httpStatusCode,
            requestId: error.$metadata?.requestId,
            stack: error.stack
          });
          res.status(500).json({ 
            error: 'Failed to create project',
            awsError: {
              name: error.name,
              message: error.message,
              code: error.code,
              statusCode: error.$metadata?.httpStatusCode
            },
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
          });
        }
        break;
        
      case 'DELETE':
        // Delete a project from S3
        const { projectId } = req.query;
        
        if (!projectId || typeof projectId !== 'string') {
          return res.status(400).json({ error: 'Project ID is required' });
        }
        
        try {
          // Check if project exists
          const projectFiles = await listFilesInS3(`projects/${projectId}/`);
          
          if (projectFiles.length === 0) {
            return res.status(404).json({ error: 'Project not found' });
          }
          
          await deleteProjectFromS3(projectId);
          
          res.status(200).json({ message: 'Project deleted successfully' });
        } catch (error: any) {
          console.error('Error deleting project from S3:', {
            name: error.name,
            message: error.message,
            code: error.code,
            statusCode: error.$metadata?.httpStatusCode,
            requestId: error.$metadata?.requestId,
            stack: error.stack
          });
          res.status(500).json({ 
            error: 'Failed to delete project',
            awsError: {
              name: error.name,
              message: error.message,
              code: error.code,
              statusCode: error.$metadata?.httpStatusCode
            },
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
          });
        }
        break;
        
      default:
        res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
        res.status(405).json({ error: `Method ${method} not allowed` });
    }
  } catch (error) {
    console.error('Projects S3 API error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}