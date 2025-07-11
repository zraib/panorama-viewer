'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { ReactElement, useState, useEffect } from 'react';
import Link from 'next/link';
import styles from '@/styles/Welcome.module.css';

// Dynamically import PanoramaViewer to avoid SSR issues with Marzipano
const PanoramaViewer = dynamic(() => import('@/components/viewer/PanoramaViewer'), {
  ssr: false,
  loading: (): ReactElement => (
    <div id='loading'>
      <div className='loader'></div>
      <div>Loading panorama...</div>
    </div>
  ),
});

interface ConfigData {
  scenes: Array<{ id: string; name: string; [key: string]: any }>;
  projectId?: string;
  projectPath?: string;
}

export default function SceneViewer(): ReactElement {
  const router = useRouter();
  const { projectId, sceneId } = router.query;
  const [hasPanoramas, setHasPanoramas] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [sceneExists, setSceneExists] = useState<boolean>(false);

  useEffect(() => {
    if (
      !projectId ||
      typeof projectId !== 'string' ||
      !sceneId ||
      typeof sceneId !== 'string'
    ) {
      return;
    }

    const checkForScene = async () => {
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

        // Check if the specific scene exists
        const scene = configData.scenes.find(s => s.id === sceneId);
        if (!scene) {
          setError(`Scene "${sceneId}" not found in project "${projectId}"`);
          setSceneExists(false);
          setHasPanoramas(false);
          return;
        }

        setSceneExists(true);

        // Check if the scene's image file exists
        try {
          const imageResponse = await fetch(
            `/api/files/${projectId}/images/${sceneId}-pano.jpg`,
            {
              method: 'HEAD',
              cache: 'no-store',
            }
          );

          if (imageResponse.ok) {
            setHasPanoramas(true);
          } else {
            setError(`Panorama image not found for scene "${sceneId}"`);
            setHasPanoramas(false);
          }
        } catch {
          setError(`Failed to verify panorama image for scene "${sceneId}"`);
          setHasPanoramas(false);
        }
      } catch (error) {
        console.error('Error checking for scene:', error);
        setError('Failed to load scene data');
        setHasPanoramas(false);
      } finally {
        setLoading(false);
      }
    };

    checkForScene();
  }, [projectId, sceneId]);

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.content}>
          <div className={styles.icon}>⏳</div>
          <h1 className={styles.title}>Loading Scene</h1>
          <p className={styles.description}>
            Loading scene "{sceneId}" from project "{projectId}"...
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
          <h1 className={styles.title}>Scene Error</h1>
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

            {sceneExists && (
              <Link href={`/${projectId}`} className={styles.uploadButton}>
                <span className={styles.uploadIcon}>📁</span>
                Back to Project
              </Link>
            )}

            <Link href='/upload' className={styles.uploadButton}>
              <span className={styles.uploadIcon}>📁</span>
              Upload New Project
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // If panorama exists, show the viewer with project and scene context
  if (hasPanoramas && config) {
    return (
      <div>
        {/* Logo */}
        <div
          style={{
            position: 'absolute',
            top: '20px',
            left: '20px',
            zIndex: 1100,
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            padding: '10px 10px',
            borderRadius: '14px',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.35)',
            marginBottom: '10px',
          }}
        >
          <img
            src='/assets/svg/primezone-logo.svg'
            alt='PrimeZone Logo'
            style={{
              height: '60px',
              width: 'auto',
              display: 'block',
            }}
          />
        </div>

        <PanoramaViewer
          projectId={projectId as string}
          initialSceneId={sceneId as string}
        />
      </div>
    );
  }

  // Fallback - should not reach here
  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.icon}>🤔</div>
        <h1 className={styles.title}>Something went wrong</h1>
        <p className={styles.description}>Unable to load scene data.</p>

        <Link href='/' className={styles.uploadButton}>
          <span className={styles.uploadIcon}>🏠</span>
          Back to Home
        </Link>
      </div>
    </div>
  );
}
