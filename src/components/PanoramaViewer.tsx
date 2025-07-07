'use client';

import { useState, useEffect, useRef, useCallback, MouseEvent } from 'react';
import Script from 'next/script';
import { useRouter } from 'next/router';
import MiniMap from './MiniMap';
import LoadingScreen from './LoadingScreen';
import ControlPanel from './ControlPanel';
import Hotspot from './Hotspot';
import {
  checkWebGLSupport,
  createRipple,
  getWebGLDiagnostics,
} from '@/lib/panoramaUtils';
import {
  ConfigData,
  SceneInfo as SceneInfoType,
  LinkHotspot,
} from '@/types/scenes';

// Using types imported from @/types/scenes.ts

// Utility to convert yaw/pitch to 2D screen coordinates
function yawPitchToScreen(
  yaw: number,
  pitch: number,
  width: number,
  height: number,
  fov: number
) {
  // Equirectangular projection: center is (width/2, height/2)
  // Yaw: 0 is center, positive is right; Pitch: 0 is center, positive is up
  // fov in radians
  const x = width / 2 + (width / fov) * yaw;
  const y = height / 2 - (height / fov) * pitch;
  return { x, y };
}

interface PanoramaViewerProps {
  projectId?: string;
  initialSceneId?: string;
}

export default function PanoramaViewer({
  projectId,
  initialSceneId,
}: PanoramaViewerProps = {}) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [currentScene, setCurrentScene] = useState<string | null>(null);
  const [hotspotsVisible, setHotspotsVisible] = useState<boolean>(false);

  const [showTapHint, setShowTapHint] = useState<boolean>(false);
  const [viewerSize, setViewerSize] = useState({ width: 0, height: 0 });
  const [arrowStyle, setArrowStyle] = useState<{ transform?: string }>({});
  const [currentYaw, setCurrentYaw] = useState<number>(0);
  const [rotationAngle, setRotationAngle] = useState<number>(-90);
  const [currentViewParams, setCurrentViewParams] = useState<{
    yaw: number;
    pitch: number;
    fov: number;
  } | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [performanceStats, setPerformanceStats] = useState<{
    loadedScenes: number;
    memoryUsage: string;
    avgLoadTime: number;
  }>({ loadedScenes: 0, memoryUsage: '0 MB', avgLoadTime: 0 });
  const loadTimesRef = useRef<number[]>([]);

  const viewerRef = useRef<Marzipano.Viewer | null>(null);
  const scenesRef = useRef<Record<string, SceneInfoType>>({});
  const panoRef = useRef<HTMLDivElement>(null);
  const hotspotTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const marzipanoRef = useRef<boolean>(false);

  // Clear hotspots for a scene
  const clearHotspotsForScene = useCallback(
    (sceneInfo: SceneInfoType): void => {
      if (!sceneInfo.scene) return;

      try {
        const hotspotContainer = sceneInfo.scene.hotspotContainer();

        // Destroy all hotspots
        const hotspots = hotspotContainer.listHotspots();
        hotspots.forEach((hotspot: Marzipano.Hotspot) => {
          hotspotContainer.destroyHotspot(hotspot);
        });

        // Clear our references
        sceneInfo.hotspotElements = [];
      } catch (err) {
        // Ignore errors during cleanup
        sceneInfo.hotspotElements = [];
      }
    },
    []
  );

  // Create hotspots for a scene
  const createHotspotsForScene = useCallback(
    (sceneInfo: SceneInfoType): void => {
      if (!sceneInfo.scene) return;

      try {
        const hotspotContainer = sceneInfo.scene.hotspotContainer();

        // Clear any existing hotspots first
        clearHotspotsForScene(sceneInfo);

        // Create new hotspots
        sceneInfo.data.linkHotspots.forEach((hotspotData: LinkHotspot) => {
          const element = document.createElement('div');

          hotspotContainer.createHotspot(element, {
            yaw: hotspotData.yaw,
            pitch: hotspotData.pitch,
          });

          sceneInfo.hotspotElements.push(element);
        });
      } catch (err) {
        console.error('Error creating hotspots:', err);
      }
    },
    [clearHotspotsForScene]
  );

  // Calculate distance between two scenes
  const calculateSceneDistance = useCallback(
    (scene1: string, scene2: string): number => {
      const s1 = scenesRef.current[scene1]?.data;
      const s2 = scenesRef.current[scene2]?.data;
      if (!s1 || !s2) return Infinity;

      const dx = s1.position.x - s2.position.x;
      const dy = s1.position.y - s2.position.y;
      const dz = s1.position.z - s2.position.z;
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    },
    []
  );

  // Update performance statistics
  const updatePerformanceStats = useCallback(() => {
    const loadedCount = Object.values(scenesRef.current).filter(
      s => s.loaded
    ).length;
    const avgTime =
      loadTimesRef.current.length > 0
        ? loadTimesRef.current.reduce((a, b) => a + b, 0) /
          loadTimesRef.current.length
        : 0;

    // Estimate memory usage (rough calculation)
    const estimatedMemoryMB = loadedCount * 8; // ~8MB per scene estimate

    setPerformanceStats({
      loadedScenes: loadedCount,
      memoryUsage: `${estimatedMemoryMB} MB`,
      avgLoadTime: Math.round(avgTime),
    });
  }, []);

  // Load a single scene on demand with progressive quality
  const loadScene = useCallback(
    async (
      sceneId: string,
      priority: 'high' | 'normal' | 'low' = 'normal'
    ): Promise<void> => {
      const sceneInfo = scenesRef.current[sceneId];
      if (!sceneInfo || sceneInfo.loaded) return;

      const startTime = performance.now();
      const viewer = viewerRef.current;
      const { Marzipano } = window;

      try {
        // Create source with project-specific path
        const imagePath = projectId
          ? `/${projectId}/images/${sceneInfo.data.id}-pano.jpg`
          : `/images/${sceneInfo.data.id}-pano.jpg`;
        const source = Marzipano.ImageUrlSource.fromString(imagePath);

        // Progressive geometry based on priority and total scene count
        const totalScenes = Object.keys(scenesRef.current).length;
        let geometry;

        if (totalScenes > 100 || priority === 'low') {
          // Ultra-light for large datasets
          geometry = new Marzipano.EquirectGeometry([
            { width: 256 },
            { width: 512 },
            { width: 1024 },
            { width: 2048 },
          ]);
        } else if (totalScenes > 50 || priority === 'normal') {
          // Balanced for medium datasets
          geometry = new Marzipano.EquirectGeometry([
            { width: 512 },
            { width: 1024 },
            { width: 2048 },
            { width: 3072 },
          ]);
        } else {
          // Full quality for small datasets or high priority
          geometry = new Marzipano.EquirectGeometry([
            { width: 512 },
            { width: 1024 },
            { width: 2048 },
            { width: 4096 },
          ]);
        }

        // Create view with zoom-friendly limits (always 4096 for zoom functionality)
        const limiter = Marzipano.RectilinearView.limit.traditional(
          4096, // Keep 4096 for zoom functionality
          (120 * Math.PI) / 180
        );
        const view = new Marzipano.RectilinearView(
          sceneInfo.data.initialViewParameters,
          limiter
        );

        // Create scene
        if (!viewer) {
          throw new Error('Viewer not initialized');
        }
        const scene = viewer.createScene({
          source: source,
          geometry: geometry,
          view: view,
          pinFirstLevel: true,
        });

        // Update scene info
        sceneInfo.scene = scene;
        sceneInfo.loaded = true;

        // Track performance
        const loadTime = performance.now() - startTime;
        loadTimesRef.current.push(loadTime);
        if (loadTimesRef.current.length > 20) {
          loadTimesRef.current.shift(); // Keep only last 20 measurements
        }
        updatePerformanceStats();

        console.log(
          `Loaded scene ${sceneId} with ${priority} priority in ${Math.round(loadTime)}ms (${Object.keys(scenesRef.current).length} total scenes)`
        );
      } catch (err) {
        console.error(`Failed to load scene ${sceneId}:`, err);
      }
    },
    [updatePerformanceStats]
  );

  // Smart preloading with distance-based prioritization
  const preloadAdjacentScenes = useCallback(
    async (sceneId: string): Promise<void> => {
      const sceneInfo = scenesRef.current[sceneId];
      if (!sceneInfo) return;

      const totalScenes = Object.keys(scenesRef.current).length;
      const connections = sceneInfo.data.linkHotspots.map(h => h.target);

      // Adaptive limits based on total scene count
      const maxPreloadedScenes =
        totalScenes > 200
          ? 6
          : totalScenes > 100
            ? 8
            : totalScenes > 50
              ? 12
              : 16;
      const maxPriorityConnections =
        totalScenes > 200 ? 2 : totalScenes > 100 ? 3 : 4;

      const loadedScenes = Object.values(scenesRef.current).filter(
        s => s.loaded
      );

      // If we have too many loaded scenes, unload the furthest ones by distance
      if (loadedScenes.length > maxPreloadedScenes) {
        const scenesToUnload = loadedScenes
          .filter(
            s => s.data.id !== sceneId && !connections.includes(s.data.id)
          )
          .map(s => ({
            scene: s,
            distance: calculateSceneDistance(sceneId, s.data.id),
          }))
          .sort((a, b) => b.distance - a.distance) // Sort by distance (furthest first)
          .slice(0, loadedScenes.length - maxPreloadedScenes)
          .map(item => item.scene);

        scenesToUnload.forEach(scene => {
          if (scene.scene) {
            try {
              scene.scene.destroy();
              scene.scene = null;
              scene.loaded = false;
              clearHotspotsForScene(scene);
              console.log(`Unloaded distant scene: ${scene.data.id}`);
            } catch (err) {
              console.warn(`Error unloading scene ${scene.data.id}:`, err);
            }
          }
        });
        updatePerformanceStats();
      }

      // Sort connections by distance for priority loading
      const connectionsByDistance = connections
        .map(targetId => ({
          id: targetId,
          distance: calculateSceneDistance(sceneId, targetId),
        }))
        .sort((a, b) => a.distance - b.distance);

      // Preload closest connections with high priority
      const priorityConnections = connectionsByDistance.slice(
        0,
        maxPriorityConnections
      );

      // Create low-priority image preloads for remaining connections
      connectionsByDistance
        .slice(maxPriorityConnections)
        .forEach(({ id: targetId }) => {
          const img = new Image();
          img.loading = 'lazy';
          const imagePath = projectId
            ? `/${projectId}/images/${targetId}-pano.jpg`
            : `/images/${targetId}-pano.jpg`;
          img.src = imagePath;
        });

      // Load priority scenes in Marzipano with staggered timing
      for (let i = 0; i < priorityConnections.length; i++) {
        const { id: targetId } = priorityConnections[i];
        if (
          scenesRef.current[targetId] &&
          !scenesRef.current[targetId].loaded
        ) {
          try {
            // Stagger loading to prevent overwhelming the system
            if (i > 0) {
              await new Promise(resolve => setTimeout(resolve, 100 * i));
            }
            await loadScene(targetId, i === 0 ? 'normal' : 'low');
          } catch (err) {
            console.error(`Failed to preload scene ${targetId}:`, err);
          }
        }
      }
    },
    [
      loadScene,
      clearHotspotsForScene,
      calculateSceneDistance,
      updatePerformanceStats,
    ]
  );

  // Switch scene
  const switchScene = useCallback(
    async (
      sceneId: string,
      isInitial: boolean = false,
      preserveViewDirection: boolean = false
    ): Promise<void> => {
      const sceneInfo = scenesRef.current[sceneId];
      if (!sceneInfo || !viewerRef.current) return;

      // Load scene if not already loaded
      if (!sceneInfo.loaded) {
        await loadScene(sceneId, 'high');
      }

      // Ensure scene is loaded before proceeding
      if (!sceneInfo.scene) {
        console.error(`Scene ${sceneId} is not loaded yet or failed to load`);
        return;
      }

      // Use tracked view direction if preserving and available
      let currentView = null;
      if (preserveViewDirection && !isInitial && currentViewParams) {
        // Apply north offset correction when preserving view direction
        const currentSceneData = currentScene
          ? scenesRef.current[currentScene]?.data
          : null;
        const targetSceneData = sceneInfo.data;

        if (currentSceneData && targetSceneData) {
          // Calculate the difference in north offsets between scenes
          const northOffsetDiff =
            (targetSceneData.northOffset || 0) -
            (currentSceneData.northOffset || 0);
          // Convert to radians and apply to yaw
          const adjustedYaw =
            currentViewParams.yaw + (northOffsetDiff * Math.PI) / 180;

          currentView = {
            ...currentViewParams,
            yaw: adjustedYaw,
          };
        } else {
          currentView = currentViewParams;
        }
      }

      // Clear existing hotspots before switching
      if (currentScene && scenesRef.current[currentScene]) {
        clearHotspotsForScene(scenesRef.current[currentScene]);
      }

      // Hide hotspots immediately for clean transition
      setHotspotsVisible(false);

      // Switch scene with smooth transition
      const transitionDuration = isInitial ? 0 : 1200; // Longer for smoother effect

      sceneInfo.scene.switchTo({
        transitionDuration: transitionDuration,
      });

      // Coordinate view change with slight delay
      setTimeout(() => {
        const viewParams = currentView || sceneInfo.data.initialViewParameters;
        if (viewerRef.current) {
          viewerRef.current.lookTo(viewParams, {
            transitionDuration: 0, // Apply instantly without rotation
          });
        }
      }, 0);

      setCurrentScene(sceneId);

      // Create hotspots but don't show them yet
      createHotspotsForScene(sceneInfo);

      // Show hotspots only after transition completes
      if (!isInitial) {
        setTimeout(() => {
          setHotspotsVisible(true);
          // Auto-hide after 5 seconds
          if (hotspotTimeoutRef.current) {
            clearTimeout(hotspotTimeoutRef.current);
          }
          hotspotTimeoutRef.current = setTimeout(() => {
            setHotspotsVisible(false);
          }, 5000);
        }, 1300); // Wait for transition to complete
      }

      // Preload adjacent scenes in background after transition
      setTimeout(() => {
        preloadAdjacentScenes(sceneId).catch(err => {
          console.error('Error preloading adjacent scenes:', err);
        });
      }, transitionDuration + 300); // Wait for transition to complete
    },
    [
      currentScene,
      loadScene,
      clearHotspotsForScene,
      createHotspotsForScene,
      preloadAdjacentScenes,
      currentViewParams,
    ]
  );

  // Initialize viewer
  const initializeViewer = useCallback(async () => {
    try {
      // Check WebGL support with detailed diagnostics
      if (!checkWebGLSupport()) {
        const diagnostics = getWebGLDiagnostics();
        console.error('WebGL Diagnostics:', diagnostics);
        throw new Error(
          `WebGL is not supported or disabled in your browser. Diagnostics: ${diagnostics}`
        );
      }

      // Load configuration with project-specific path
      const configUrl = projectId
        ? `/api/projects/${encodeURIComponent(projectId)}/config`
        : '/config.json';
      const response = await fetch(configUrl);
      if (!response.ok) {
        throw new Error(`Failed to load config: ${response.statusText}`);
      }

      const configData = (await response.json()) as ConfigData;
      setConfig(configData);

      // Initialize Marzipano viewer
      const Marzipano = (window as any).Marzipano;
      if (!Marzipano) {
        throw new Error('Marzipano library not loaded');
      }

      const viewerOpts = {
        controls: {
          mouseViewMode: 'drag',
        },
        stage: {
          progressive: true,
        },
      };

      if (!panoRef.current) {
        throw new Error('Panorama container not found');
      }

      const viewer = new Marzipano.Viewer(panoRef.current, viewerOpts);
      viewerRef.current = viewer;

      // Add view change listener to track current viewing direction
      const updateViewParams = () => {
        try {
          if (viewer) {
            const view = viewer.view();
            setCurrentViewParams({
              yaw: view.yaw(),
              pitch: view.pitch(),
              fov: view.fov(),
            });
          }
        } catch (err) {
          // Silently ignore errors during view tracking
        }
      };

      // Listen for view changes
      if (viewer.addEventListener) {
        viewer.addEventListener('viewChange', updateViewParams);
      }

      // Also update on mouse/touch interactions
      if (panoRef.current) {
        panoRef.current.addEventListener('mouseup', updateViewParams);
        panoRef.current.addEventListener('touchend', updateViewParams);
      }

      // Initialize scenes object (but don't create them yet)
      configData.scenes.forEach(sceneData => {
        scenesRef.current[sceneData.id] = {
          data: sceneData,
          scene: null,
          hotspotElements: [],
          loaded: false,
        };
      });

      // Load and display initial scene with high priority
      if (configData.scenes.length > 0) {
        let targetScene = configData.scenes[0];

        // Use initialSceneId if provided and exists
        if (initialSceneId) {
          const foundScene = configData.scenes.find(
            s => s.id === initialSceneId
          );
          if (foundScene) {
            targetScene = foundScene;
          }
        }

        await loadScene(targetScene.id, 'high');
        switchScene(targetScene.id, true, false);
      }

      setIsLoading(false);

      // Show tap hint after a delay
      setTimeout(() => setShowTapHint(true), 1000);
      setTimeout(() => setShowTapHint(false), 4000);
    } catch (err) {
      console.error('Initialization error:', err);
      setError(err instanceof Error ? err.message : String(err));
      setIsLoading(false);
    }
  }, [loadScene, switchScene]);

  // Navigate to scene
  const navigateToScene = useCallback(
    async (sceneId: string, sourceHotspotYaw?: number): Promise<void> => {
      if (sceneId === currentScene) return;

      // First ensure the target scene is fully loaded
      const sceneInfo = scenesRef.current[sceneId];
      if (sceneInfo) {
        // Create image element to force preload with project-specific path
        const img = new Image();
        const imagePath = projectId
          ? `/${projectId}/images/${sceneId}-pano.jpg`
          : `/images/${sceneId}-pano.jpg`;
        img.src = imagePath;

        // Wait for image to load
        await new Promise<void>(resolve => {
          img.onload = () => resolve();
          img.onerror = () => resolve(); // Continue even if error
        });

        // Load scene in Marzipano if not already loaded
        if (!sceneInfo.loaded) {
          await loadScene(sceneId, 'high');
        }
      }

      // Update URL when navigating via hotspots without triggering page reload
      if (projectId) {
        const newUrl = `/${projectId}/${sceneId}`;
        window.history.replaceState(null, '', newUrl);
      }

      // Switch scene directly
      await switchScene(sceneId, false, true);
    },
    [switchScene, currentScene, loadScene, router, projectId]
  );

  // Toggle hotspots
  const toggleHotspots = useCallback((): void => {
    if (hotspotsVisible) {
      setHotspotsVisible(false);
      if (hotspotTimeoutRef.current) {
        clearTimeout(hotspotTimeoutRef.current);
      }
    } else {
      setHotspotsVisible(true);
      // Auto-hide after 5 seconds
      if (hotspotTimeoutRef.current) {
        clearTimeout(hotspotTimeoutRef.current);
      }
      hotspotTimeoutRef.current = setTimeout(() => {
        setHotspotsVisible(false);
      }, 5000);
    }
  }, [hotspotsVisible]);

  // Handle panorama click
  const handlePanoClick = useCallback(
    (e: MouseEvent<HTMLDivElement>): void => {
      // Don't toggle if clicking a hotspot
      if ((e.target as HTMLElement).closest('.hotspot')) return;

      // Show touch ripple effect
      createRipple(e.clientX, e.clientY, panoRef.current);

      // Toggle hotspots
      toggleHotspots();
    },
    [toggleHotspots]
  );

  // Handle keyboard controls
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent): void => {
      if (e.key === ' ') {
        e.preventDefault();
        toggleHotspots();
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, [toggleHotspots]);

  // WebGL context loss recovery
  const handleWebGLContextLoss = useCallback(() => {
    console.warn('WebGL context lost, attempting recovery...');
    setError('WebGL context was lost. Reloading viewer...');

    // Attempt to reinitialize after a short delay
    setTimeout(() => {
      if (checkWebGLSupport()) {
        setError(null);
        setIsLoading(true);
        initializeViewer();
      } else {
        setError(
          'WebGL context could not be restored. Please refresh the page.'
        );
      }
    }, 1000);
  }, [initializeViewer]);

  // Initialize when Marzipano loads
  const handleMarzipanoLoad = (): void => {
    marzipanoRef.current = true;
    initializeViewer();
  };

  // Add WebGL context loss listeners
  useEffect(() => {
    const canvas = panoRef.current?.querySelector('canvas');
    if (canvas) {
      const handleContextLost = (event: Event) => {
        event.preventDefault();
        handleWebGLContextLoss();
      };

      const handleContextRestored = () => {
        console.log('WebGL context restored');
        handleWebGLContextLoss();
      };

      canvas.addEventListener('webglcontextlost', handleContextLost);
      canvas.addEventListener('webglcontextrestored', handleContextRestored);

      return () => {
        canvas.removeEventListener('webglcontextlost', handleContextLost);
        canvas.removeEventListener(
          'webglcontextrestored',
          handleContextRestored
        );
      };
    }
  }, [handleWebGLContextLoss, viewerRef.current]);

  // Check if Marzipano is already loaded on mount
  useEffect(() => {
    // If Marzipano is already available (e.g., when navigating back)
    if ((window as any).Marzipano && !marzipanoRef.current) {
      handleMarzipanoLoad();
    }
  }, []);

  useEffect(() => {
    function updateSize() {
      if (panoRef.current) {
        setViewerSize({
          width: panoRef.current.offsetWidth,
          height: panoRef.current.offsetHeight,
        });
      }
    }
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Update arrow rotation on view change
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || isLoading) return;

    const updateArrowRotation = () => {
      const view = viewer.view();
      const yaw = view.yaw();
      const fov = view.fov();
      
      // Calculate zoom level (1 = fully zoomed in, 0 = fully zoomed out)
      const maxFov = (120 * Math.PI) / 180; // Max FOV from limiter
      const minFov = (30 * Math.PI) / 180;   // Min FOV (zoom in)
      const zoom = 1 - (fov - minFov) / (maxFov - minFov);
      setZoomLevel(zoom);
      
      let rotation = yaw * (180 / Math.PI); // Convert radians to degrees

      // Apply north offset correction for compass arrow
      if (currentScene && scenesRef.current[currentScene]?.data?.northOffset) {
        rotation += scenesRef.current[currentScene].data.northOffset;
      }

      setCurrentYaw(yaw);
      setArrowStyle({
        transform: `rotate(${rotation}deg)`,
      });
    };

    if (viewer.addEventListener) {
      viewer.addEventListener('viewChange', updateArrowRotation);
    }

    return () => {
      if (viewer && viewer.removeEventListener) {
        viewer.removeEventListener('viewChange', updateArrowRotation);
      }
    };
  }, [isLoading, currentScene]);

  // Cleanup on unmount
  useEffect(() => {
    // Store reference to scenes for cleanup function
    const scenes = scenesRef.current;

    return () => {
      // Clear all hotspots
      Object.values(scenes).forEach(sceneInfo => {
        if (sceneInfo.scene) {
          clearHotspotsForScene(sceneInfo);
        }
      });

      // Don't destroy viewer or scenes - let browser handle cleanup
    };
  }, [clearHotspotsForScene]);

  // Retry function for WebGL errors
  const handleRetry = useCallback(() => {
    setError(null);
    setIsLoading(true);
    // Small delay to ensure state is reset
    setTimeout(() => {
      initializeViewer();
    }, 100);
  }, [initializeViewer]);

  // Optimize performance by unloading distant scenes
  const optimizePerformance = useCallback(() => {
    if (!currentScene) return;

    const loadedScenes = Object.values(scenesRef.current).filter(s => s.loaded);
    const currentConnections =
      scenesRef.current[currentScene]?.data.linkHotspots.map(h => h.target) ||
      [];

    // Unload all scenes except current and immediate connections
    const scenesToUnload = loadedScenes.filter(
      s => s.data.id !== currentScene && !currentConnections.includes(s.data.id)
    );

    scenesToUnload.forEach(scene => {
      if (scene.scene) {
        try {
          scene.scene.destroy();
          scene.scene = null;
          scene.loaded = false;
          clearHotspotsForScene(scene);
        } catch (err) {
          console.warn(
            `Error during optimization unload ${scene.data.id}:`,
            err
          );
        }
      }
    });

    updatePerformanceStats();
    console.log(`Optimized: Unloaded ${scenesToUnload.length} distant scenes`);
  }, [currentScene, clearHotspotsForScene, updatePerformanceStats]);

  if (error) {
    return <LoadingScreen error={error} onRetry={handleRetry} />;
  }

  return (
    <>
      <Script
        src='/assets/js/marzipano.js'
        strategy='afterInteractive'
        onLoad={handleMarzipanoLoad}
      />

      {isLoading && <LoadingScreen />}

      {/* Logo */}
      <div
        style={{
          position: 'absolute',
          top: '20px',
          left: '20px',
          zIndex: 1200,
          background: 'rgba(0, 0, 0, 0.65)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          padding: '10px',
          borderRadius: '14px',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.35)',
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

      <div
        ref={panoRef}
        id='pano'
        style={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          cursor: 'grab',
        }}
        onClick={handlePanoClick}
        onMouseDown={e =>
          ((e.currentTarget as HTMLElement).style.cursor = 'grabbing')
        }
        onMouseUp={e =>
          ((e.currentTarget as HTMLElement).style.cursor = 'grab')
        }
      />

      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: 'white',
          fontSize: '14px',
          fontWeight: '500',
          textShadow: '0 2px 4px rgba(0,0,0,0.8)',
          zIndex: 1600,
          pointerEvents: 'none',
        }}
      />

      {showTapHint && (
        <div className='tap-hint show'>Tap anywhere to show navigation</div>
      )}

      {/* Unified Control Panel */}
      <ControlPanel
        scenes={config?.scenes || []}
        currentScene={
          currentScene && scenesRef.current[currentScene]
            ? scenesRef.current[currentScene].data
            : null
        }
        onFloorChange={navigateToScene}
        performanceStats={performanceStats}
        totalScenes={config?.scenes.length || 0}
        onOptimize={optimizePerformance}
      />

      {config && currentScene && scenesRef.current[currentScene] && (
        <>
          <MiniMap
            scenes={config.scenes}
            currentScene={scenesRef.current[currentScene]?.data}
            viewer={viewerRef.current}
            onSelectScene={navigateToScene}
            rotationAngle={rotationAngle}
          />

          {/* Render hotspots */}
          {scenesRef.current[currentScene]?.hotspotElements?.map(
            (element, index) => {
              const hotspotData =
                scenesRef.current[currentScene]?.data?.linkHotspots[index];
              if (!hotspotData) return null;

              return (
                <Hotspot
                  key={`${currentScene}-${index}-${hotspotData.target}`}
                  element={element}
                  data={hotspotData}
                  visible={hotspotsVisible}
                  onNavigate={navigateToScene}
                  zoomLevel={zoomLevel}
                />
              );
            }
          )}
        </>
      )}

      <div id='controls-hint'>
        <div>🖱️ Drag to look around • Click to show paths</div>
        <div>📍 Click on arrows to navigate</div>
      </div>

      <style jsx>{`
        .tap-hint {
          position: absolute;
          bottom: 40px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(0, 0, 0, 0.8);
          color: white;
          padding: 12px 24px;
          border-radius: 24px;
          font-size: 14px;
          opacity: 0;
          transition: opacity 0.5s;
          pointer-events: none;
          z-index: 1000;
        }

        .compass-arrow-container {
          position: absolute;
          top: 20px;
          right: 20px;
          width: 60px;
          height: 60px;
          background: rgba(0, 0, 0, 0.5);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1300;
          transition: transform 0.2s linear;
        }

        .compass-arrow {
          width: 0;
          height: 0;
          border-left: 15px solid transparent;
          border-right: 15px solid transparent;
          border-bottom: 30px solid red;
          transform: translateY(-5px);
        }

        .tap-hint.show {
          opacity: 1;
          animation: fadeInOut 3s ease-in-out;
        }

        #controls-hint {
          position: absolute;
          bottom: 20px;
          left: 20px;
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          color: white;
          padding: 12px 16px;
          border-radius: 8px;
          font-size: 12px;
          z-index: 1000;
          opacity: 0.8;
        }

        @media (max-width: 768px) {
          #controls-hint {
            display: none;
          }
        }
      `}</style>
    </>
  );
}
