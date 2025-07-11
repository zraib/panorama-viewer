import { useCallback, useMemo } from 'react';
import { SceneInfo as SceneInfoType } from '@/types/scenes';
import { PanoramaViewerRefs, PanoramaViewerActions, ViewParams } from './usePanoramaViewer';

// Error types for better error handling
export enum SceneManagerError {
  SCENE_NOT_FOUND = 'SCENE_NOT_FOUND',
  VIEWER_NOT_INITIALIZED = 'VIEWER_NOT_INITIALIZED',
  SCENE_LOAD_FAILED = 'SCENE_LOAD_FAILED',
  INVALID_SCENE_DATA = 'INVALID_SCENE_DATA',
}

export class SceneManagerException extends Error {
  constructor(public type: SceneManagerError, message: string, public sceneId?: string) {
    super(message);
    this.name = 'SceneManagerException';
  }
}

export interface UseSceneManagerProps {
  refs: PanoramaViewerRefs;
  actions: PanoramaViewerActions;
  projectId?: string;
  currentScene: string | null;
  currentViewParams: ViewParams | null;
}

export function useSceneManager({
  refs,
  actions,
  projectId,
  currentScene,
  currentViewParams,
}: UseSceneManagerProps) {
  // Calculate distance between two scenes with improved validation
  const calculateSceneDistance = useCallback(
    (scene1: string, scene2: string): number => {
      try {
        if (!scene1 || !scene2) {
          console.warn('Invalid scene IDs provided for distance calculation');
          return Infinity;
        }

        const s1 = refs.scenesRef.current[scene1]?.data;
        const s2 = refs.scenesRef.current[scene2]?.data;
        
        if (!s1 || !s2) {
          console.warn(`Scene not found: ${!s1 ? scene1 : scene2}`);
          return Infinity;
        }

        // Validate coordinates
        if (!s1.position || !s2.position ||
            typeof s1.position.x !== 'number' || typeof s1.position.y !== 'number' || typeof s1.position.z !== 'number' ||
            typeof s2.position.x !== 'number' || typeof s2.position.y !== 'number' || typeof s2.position.z !== 'number') {
          console.warn('Invalid scene coordinates for distance calculation');
          return Infinity;
        }

        const dx = s1.position.x - s2.position.x;
        const dy = s1.position.y - s2.position.y;
        const dz = s1.position.z - s2.position.z;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        
        return isNaN(distance) ? Infinity : distance;
      } catch (error) {
        console.error('Error calculating scene distance:', error);
        return Infinity;
      }
    },
    [refs.scenesRef]
  );

  // Update performance statistics
  const updatePerformanceStats = useCallback(() => {
    const loadedCount = Object.values(refs.scenesRef.current).filter(
      s => s.loaded
    ).length;
    const avgTime =
      refs.loadTimesRef.current.length > 0
        ? refs.loadTimesRef.current.reduce((a, b) => a + b, 0) /
          refs.loadTimesRef.current.length
        : 0;

    // Estimate memory usage (rough calculation)
    const estimatedMemoryMB = loadedCount * 8; // ~8MB per scene estimate

    actions.setPerformanceStats({
      loadedScenes: loadedCount,
      memoryUsage: `${estimatedMemoryMB} MB`,
      avgLoadTime: Math.round(avgTime),
    });
  }, [refs.scenesRef, refs.loadTimesRef, actions]);

  // Load a single scene on demand with progressive quality
  const loadScene = useCallback(
    async (
      sceneId: string,
      priority: 'high' | 'normal' | 'low' = 'normal'
    ): Promise<void> => {
      const sceneInfo = refs.scenesRef.current[sceneId];
      if (!sceneInfo || sceneInfo.loaded) return;

      const startTime = performance.now();
      const viewer = refs.viewerRef.current;
      const { Marzipano } = window;

      try {
        // Create source with project-specific path
        const imagePath = projectId
          ? `/api/files/${projectId}/images/${sceneInfo.data.id}-pano.jpg`
      : `/api/files/images/${sceneInfo.data.id}-pano.jpg`;
        const source = Marzipano.ImageUrlSource.fromString(imagePath);

        // Progressive geometry based on priority and total scene count
        const totalScenes = Object.keys(refs.scenesRef.current).length;
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

        // Wait for the image to actually load by preloading it
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Scene load timeout'));
          }, 15000); // 15 second timeout

          const img = new Image();
          img.onload = () => {
            clearTimeout(timeout);
            resolve();
          };
          img.onerror = () => {
            clearTimeout(timeout);
            reject(new Error('Failed to load scene image'));
          };
          img.src = imagePath;
        });

        // Update scene info
        sceneInfo.scene = scene;
        sceneInfo.loaded = true;

        // Track performance - now measuring actual load time
        const loadTime = performance.now() - startTime;
        refs.loadTimesRef.current.push(loadTime);
        if (refs.loadTimesRef.current.length > 20) {
          refs.loadTimesRef.current.shift(); // Keep only last 20 measurements
        }
        updatePerformanceStats();

        console.log(
          `Loaded scene ${sceneId} with ${priority} priority in ${Math.round(loadTime)}ms (${Object.keys(refs.scenesRef.current).length} total scenes)`
        );
      } catch (err) {
        console.error(`Failed to load scene ${sceneId}:`, err);
        // Still track the time even if it failed, but don't add to successful load times
        const loadTime = performance.now() - startTime;
        console.log(`Failed to load scene ${sceneId} after ${Math.round(loadTime)}ms`);
      }
    },
    [refs, projectId, updatePerformanceStats]
  );

  // Switch scene with improved error handling
  const switchScene = useCallback(
    async (
      sceneId: string,
      isInitial: boolean,
      preserveViewDirection: boolean,
      clearHotspotsForScene: (sceneInfo: SceneInfoType) => void,
      createHotspotsForScene: (sceneInfo: SceneInfoType) => void,
      preloadAdjacentScenes: (sceneId: string) => Promise<void>
    ): Promise<void> => {
      const switchStartTime = performance.now();
      
      try {
        if (!sceneId) {
          throw new SceneManagerException(
            SceneManagerError.INVALID_SCENE_DATA,
            'Scene ID is required for switching',
            sceneId
          );
        }

        if (!refs.viewerRef.current) {
          throw new SceneManagerException(
            SceneManagerError.VIEWER_NOT_INITIALIZED,
            'Viewer is not initialized',
            sceneId
          );
        }

        const sceneInfo = refs.scenesRef.current[sceneId];
        if (!sceneInfo) {
          throw new SceneManagerException(
            SceneManagerError.SCENE_NOT_FOUND,
            `Scene ${sceneId} not found in scenes reference`,
            sceneId
          );
        }

        console.log(`Starting scene switch to: ${sceneId}`);
        actions.setIsLoading?.(true);
        actions.setError?.(null); // Clear any previous errors

        // Load scene if not already loaded
        if (!sceneInfo.loaded) {
          try {
            await loadScene(sceneId, 'high');
          } catch (loadError) {
            throw new SceneManagerException(
              SceneManagerError.SCENE_LOAD_FAILED,
              `Failed to load scene: ${loadError instanceof Error ? loadError.message : 'Unknown error'}`,
              sceneId
            );
          }
        }

        // Ensure scene is loaded before proceeding
        if (!sceneInfo.scene) {
          throw new SceneManagerException(
            SceneManagerError.SCENE_LOAD_FAILED,
            `Scene ${sceneId} is not loaded yet or failed to load`,
            sceneId
          );
        }

        // Use tracked view direction if preserving and available
        let currentView = null;
        if (preserveViewDirection && !isInitial && currentViewParams) {
          try {
            // Apply north offset correction when preserving view direction
            const currentSceneData = currentScene
              ? refs.scenesRef.current[currentScene]?.data
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
            console.log('Preserving view direction:', currentView);
          } catch (viewError) {
            console.warn('Failed to calculate preserved view direction:', viewError);
            currentView = currentViewParams;
          }
        }

        // Clear existing hotspots before switching
        try {
          if (currentScene && refs.scenesRef.current[currentScene]) {
            clearHotspotsForScene(refs.scenesRef.current[currentScene]);
          }
        } catch (hotspotError) {
          console.warn('Failed to clear hotspots:', hotspotError);
        }

        // Hide hotspots immediately for clean transition
        actions.setHotspotsVisible?.(false);

        // Switch scene with smooth transition
        const transitionDuration = isInitial ? 0 : 1000; // Reduced duration for better performance

        try {
          // Simple scene switch without complex stage synchronization
          sceneInfo.scene.switchTo({
            transitionDuration: transitionDuration,
          });
          
          console.log(`Scene switched successfully to: ${sceneId}`);
        } catch (switchError) {
          const errorMessage = switchError instanceof Error ? switchError.message : 'Unknown error';
          console.error(`Scene switch failed for ${sceneId}:`, errorMessage);
          
          throw new SceneManagerException(
            SceneManagerError.SCENE_LOAD_FAILED,
            `Failed to switch viewer to scene: ${errorMessage}`,
            sceneId
          );
        }

        // Coordinate view change with slight delay
        setTimeout(() => {
          try {
            const viewParams = currentView || sceneInfo.data.initialViewParameters;
            if (refs.viewerRef.current && viewParams) {
              refs.viewerRef.current.lookTo(viewParams, {
                transitionDuration: 0, // Apply instantly without rotation
              });
              console.log('Applied view parameters');
            }
          } catch (viewError) {
            console.warn('Failed to apply view parameters:', viewError);
          }
        }, 0);

        actions.setCurrentScene(sceneId);

        // Create hotspots but don't show them yet
        try {
          createHotspotsForScene(sceneInfo);
        } catch (hotspotError) {
          console.warn('Failed to create hotspots:', hotspotError);
        }

        // Show hotspots only after transition completes
        if (!isInitial) {
          setTimeout(() => {
            try {
              actions.setHotspotsVisible?.(true);
              // Auto-hide after 5 seconds
              if (refs.hotspotTimeoutRef?.current) {
                clearTimeout(refs.hotspotTimeoutRef.current);
              }
              if (refs.hotspotTimeoutRef) {
                refs.hotspotTimeoutRef.current = setTimeout(() => {
                  actions.setHotspotsVisible?.(false);
                }, 5000);
              }
            } catch (hotspotError) {
              console.warn('Failed to manage hotspot visibility:', hotspotError);
            }
          }, 1300); // Wait for transition to complete
        }

        // Preload adjacent scenes in background after transition
        setTimeout(() => {
          preloadAdjacentScenes(sceneId).catch(err => {
            console.error('Error preloading adjacent scenes:', err);
          });
        }, transitionDuration + 300); // Wait for transition to complete

        actions.setIsLoading?.(false);
        
        // Measure total scene switch time and track it
        const totalSwitchTime = performance.now() - switchStartTime;
        
        // Track scene switch time in performance metrics
        refs.loadTimesRef.current.push(totalSwitchTime);
        if (refs.loadTimesRef.current.length > 20) {
          refs.loadTimesRef.current.shift(); // Keep only last 20 measurements
        }
        updatePerformanceStats();
        
        console.log(`Scene switch completed: ${sceneId} in ${Math.round(totalSwitchTime)}ms`);
      } catch (error) {
        actions.setIsLoading?.(false);
        
        if (error instanceof SceneManagerException) {
          console.error(`Scene Manager Error [${error.type}]:`, error.message);
          actions.setError?.(`Scene switch failed: ${error.message}`);
        } else {
          console.error('Unexpected error switching scene:', error);
          actions.setError?.(`Failed to switch to scene: ${sceneId}`);
        }
        
        throw error;
      }
    },
    [refs, actions, currentScene, currentViewParams, loadScene]
  );

  // Load scene with progressive quality and improved error handling
  const loadSceneWithProgressiveQuality = useCallback(
    async (sceneId: string, targetQuality: number = 2): Promise<void> => {
      try {
        if (!sceneId) {
          throw new SceneManagerException(
            SceneManagerError.INVALID_SCENE_DATA,
            'Scene ID is required for loading',
            sceneId
          );
        }

        const sceneInfo = refs.scenesRef.current[sceneId];
        if (!sceneInfo) {
          throw new SceneManagerException(
            SceneManagerError.SCENE_NOT_FOUND,
            `Scene ${sceneId} not found in scenes reference`,
            sceneId
          );
        }

        if (!refs.viewerRef.current) {
          throw new SceneManagerException(
            SceneManagerError.VIEWER_NOT_INITIALIZED,
            'Viewer is not initialized',
            sceneId
          );
        }

        // For progressive quality loading, we'll use the same approach as loadScene
        // since the scene data structure doesn't include source.levels
        console.log(`Loading scene ${sceneId} with progressive quality`);

        // Use the same loading approach as loadScene but with priority based on targetQuality
        const priority = targetQuality >= 2 ? 'high' : targetQuality >= 1 ? 'normal' : 'low';
        await loadScene(sceneId, priority);

        console.log(`Progressive loading completed for scene ${sceneId}`);
      } catch (error) {
        if (error instanceof SceneManagerException) {
          console.error(`Scene Manager Error [${error.type}]:`, error.message);
        } else {
          console.error(`Unexpected error loading scene ${sceneId}:`, error);
        }
        throw error;
      }
    },
    [refs.scenesRef, refs.viewerRef]
  );

  return {
    calculateSceneDistance,
    updatePerformanceStats,
    loadScene,
    loadSceneWithProgressiveQuality,
    switchScene,
  };
}