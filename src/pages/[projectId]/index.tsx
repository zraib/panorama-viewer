'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { ReactElement, useState, useEffect } from 'react';
import Link from 'next/link';
import styles from '@/styles/Welcome.module.css';
// ProjectManager moved to PanoramaViewer component

// Dynamically import PanoramaViewer to avoid SSR issues with Marzipano
const PanoramaViewer = dynamic(() => import('@/components/viewer/PanoramaViewer'), {
  ssr: false,
  loading: (): ReactElement => (
    <div id='loading'>
      <div className='loader'></div>
      <div>Loading panoramas...</div>
    </div>
  ),
});

interface ConfigData {
  scenes: Array<{ id: string; name: string; [key: string]: any }>;
  projectId?: string;
  projectPath?: string;
}

export default function ProjectViewer(): ReactElement {
  const router = useRouter();
  const { projectId } = router.query;
  const [hasPanoramas, setHasPanoramas] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<ConfigData | null>(null);

  // Project management handlers removed - now handled in PanoramaViewer

  useEffect(() => {
    if (!projectId || typeof projectId !== 'string') {
      return;
    }

    const checkForPanoramas = async () => {
      try {
        setLoading(true);
        setError(null);

        // Try to fetch project config
        const configResponse = await fetch(
          `/api/projects/${encodeURIComponent(projectId)}/config`,
          {
            cache: 'no-store',
          }
        );

        if (!configResponse.ok) {
          if (configResponse.status === 404) {
            setError('Project not found or no configuration available');
          } else {
            setError('Failed to load project configuration');
          }
          setHasPanoramas(false);
          return;
        }

        const configData: ConfigData = await configResponse.json();
        setConfig(configData);

        if (!configData.scenes || configData.scenes.length === 0) {
          setError('No panoramas found in this project');
          setHasPanoramas(false);
          return;
        }

        // Check if actual image files exist by testing the first few scenes
        const testScenes = configData.scenes.slice(
          0,
          Math.min(3, configData.scenes.length)
        );
        let imageExists = false;

        for (const scene of testScenes) {
          try {
            const imageResponse = await fetch(
              `/api/files/${projectId}/images/${scene.id}-pano.jpg`,
              {
                method: 'HEAD',
                cache: 'no-store',
              }
            );
            if (imageResponse.ok) {
              imageExists = true;
              break;
            }
          } catch {
            // Continue checking other images
          }
        }

        if (!imageExists) {
          setError('Panorama images not found for this project');
        }

        setHasPanoramas(imageExists);
      } catch (error) {
        console.error('Error checking for panoramas:', error);
        setError('Failed to load project data');
        setHasPanoramas(false);
      } finally {
        setLoading(false);
      }
    };

    checkForPanoramas();
  }, [projectId]);

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.content}>
          <div className={styles.icon}>⏳</div>
          <h1 className={styles.title}>Loading Project</h1>
          <p className={styles.description}>
            Please wait while we load your project...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.logoContainer}>
          <img
            src='/assets/svg/primezone-logo.svg'
            alt='PrimeZone Logo'
            className={styles.logo}
          />
        </div>

        <div className={styles.content}>
          <div className={styles.icon}>❌</div>
          <h1 className={styles.title}>Project Error</h1>
          <p className={styles.description}>{error}</p>

          <div
            style={{
              display: 'flex',
              gap: '16px',
              justifyContent: 'center',
              marginTop: '24px',
            }}
          >
            <Link href='/' className={styles.uploadButton}>
              <span className={styles.uploadIcon}>🏠</span>
              Back to Home
            </Link>

            <Link href='/upload' className={styles.uploadButton}>
              <span className={styles.uploadIcon}>📁</span>
              Upload New Project
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // If panoramas exist, show the viewer with project context
  if (hasPanoramas && config) {
    return <PanoramaViewer projectId={projectId as string} />;
  }

  // Fallback - should not reach here
  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.icon}>🤔</div>
        <h1 className={styles.title}>Something went wrong</h1>
        <p className={styles.description}>Unable to load project data.</p>

        <Link href='/' className={styles.uploadButton}>
          <span className={styles.uploadIcon}>🏠</span>
          Back to Home
        </Link>
      </div>
    </div>
  );
}
