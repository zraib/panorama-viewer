import { useCallback, useMemo } from 'react';
import { SceneInfo as SceneInfoType } from '@/types/scenes';
import { PanoramaViewerRefs, PanoramaViewerActions } from './usePanoramaViewer';

// Performance thresholds and constants
const PERFORMANCE_THRESHOLDS = {
  MAX_PRELOADED_SCENES: 8,
  MIN_PRELOADED_SCENES: 3,
  DISTANCE_THRESHOLD_CLOSE: 50,
  DISTANCE_THRESHOLD_FAR: 200,
  MEMORY_WARNING_THRESHOLD: 100 * 1024 * 1024, // 100MB
  MEMORY_CRITICAL_THRESHOLD: 200 * 1024 * 1024, // 200MB
  UNLOAD_DISTANCE_MULTIPLIER: 3,
} as const;

// Performance monitoring interface
export interface PerformanceMetrics {
  memoryUsage: number;
  loadedScenes: number;
  preloadedScenes: number;
  avgLoadTime: number;
  lastCleanupTime: number;
  performanceLevel: 'high' | 'medium' | 'low';
}

export interface UsePerformanceManagerProps {
  refs: PanoramaViewerRefs;
  actions: PanoramaViewerActions;
  projectId?: string;
  currentScene: string | null;
  calculateSceneDistance: (scene1: string, scene2: string) => number;
  loadScene: (sceneId: string, priority: 'high' | 'normal' | 'low') => Promise<void>;
  clearHotspotsForScene: (sceneInfo: SceneInfoType) => void;
  updatePerformanceStats: () => void;
}

export function usePerformanceManager({
  refs,
  actions,
  projectId,
  currentScene,
  calculateSceneDistance,
  loadScene,
  clearHotspotsForScene,
  updatePerformanceStats,
}: UsePerformanceManagerProps) {
  // Smart preloading with distance-based prioritization and improved performance management
  const preloadAdjacentScenes = useCallback(
    async (sceneId: string): Promise<void> => {
      try {
        if (!sceneId) {
          console.warn('No scene ID provided for preloading');
          return;
        }

        const sceneInfo = refs.scenesRef.current[sceneId];
        if (!sceneInfo) {
          console.warn(`Scene ${sceneId} not found for preloading`);
          return;
        }

        console.log(`Starting preload for adjacent scenes from: ${sceneId}`);

        const totalScenes = Object.keys(refs.scenesRef.current).length;
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

        const loadedScenes = Object.values(refs.scenesRef.current).filter(
          s => s.loaded
        );

        // If we have too many loaded scenes, unload the furthest ones by distance
        if (loadedScenes.length > maxPreloadedScenes) {
          const scenesToUnload = loadedScenes
            .filter(
              s => s.data.id !== sceneId && !connections.includes(s.data.id)
            )
            .map(s => {
              try {
                return {
                  scene: s,
                  distance: calculateSceneDistance(sceneId, s.data.id),
                };
              } catch (distanceError) {
                console.warn(`Failed to calculate distance for scene ${s.data.id}:`, distanceError);
                return {
                  scene: s,
                  distance: Infinity,
                };
              }
            })
            .filter(item => item.distance !== Infinity)
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
          .map(targetId => {
            try {
              return {
                id: targetId,
                distance: calculateSceneDistance(sceneId, targetId),
              };
            } catch (distanceError) {
              console.warn(`Failed to calculate distance for connection ${targetId}:`, distanceError);
              return {
                id: targetId,
                distance: Infinity,
              };
            }
          })
          .filter(item => item.distance !== Infinity && item.distance <= PERFORMANCE_THRESHOLDS.DISTANCE_THRESHOLD_FAR)
          .sort((a, b) => a.distance - b.distance);

        if (connectionsByDistance.length === 0) {
          console.log('No valid connections found within distance threshold');
          return;
        }

        // Preload closest connections with high priority
        const priorityConnections = connectionsByDistance.slice(
          0,
          maxPriorityConnections
        );

        // Create low-priority image preloads for remaining connections
        connectionsByDistance
          .slice(maxPriorityConnections)
          .forEach(({ id: targetId }) => {
            try {
              const img = new Image();
              img.loading = 'lazy';
              const imagePath = projectId
                ? `/api/files/${projectId}/images/${targetId}-pano.jpg`
      : `/api/files/images/${targetId}-pano.jpg`;
              img.src = imagePath;
            } catch (imgError) {
              console.warn(`Failed to preload image for scene ${targetId}:`, imgError);
            }
          });

        console.log(`Preloading ${priorityConnections.length} priority scenes`);

        // Load priority scenes in Marzipano with staggered timing and timeout
        for (let i = 0; i < priorityConnections.length; i++) {
          const { id: targetId, distance } = priorityConnections[i];
          if (
            refs.scenesRef.current[targetId] &&
            !refs.scenesRef.current[targetId].loaded
          ) {
            try {
              console.log(`Preloading scene ${targetId} (distance: ${distance.toFixed(2)})`);
              
              // Stagger loading to prevent overwhelming the system
              if (i > 0) {
                await new Promise(resolve => setTimeout(resolve, 100 * i));
              }
              
              // Add timeout for loading
              const loadPromise = loadScene(targetId, i === 0 ? 'normal' : 'low');
              const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Load timeout')), 15000)
              );
              
              await Promise.race([loadPromise, timeoutPromise]);
              console.log(`Successfully preloaded scene: ${targetId}`);
            } catch (err) {
              console.error(`Failed to preload scene ${targetId}:`, err);
            }
          }
        }
        
        // Update performance stats
        updatePerformanceStats();
        console.log('Preloading completed');
        
      } catch (error) {
        console.error('Error in preloadAdjacentScenes:', error);
      }
    },
    [
      refs.scenesRef,
      calculateSceneDistance,
      loadScene,
      clearHotspotsForScene,
      updatePerformanceStats,
      projectId,
    ]
  );

  // Optimize performance by unloading distant scenes
  const optimizePerformance = useCallback(() => {
    if (!currentScene) return;

    const loadedScenes = Object.values(refs.scenesRef.current).filter(s => s.loaded);
    const currentConnections =
      refs.scenesRef.current[currentScene]?.data.linkHotspots.map(h => h.target) ||
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
  }, [currentScene, refs.scenesRef, clearHotspotsForScene, updatePerformanceStats]);

  // Estimate memory usage for performance monitoring
  const getEstimatedMemoryUsage = useCallback(async (): Promise<number> => {
    try {
      // Use Performance API if available
      if ('memory' in performance) {
        return (performance as any).memory.usedJSHeapSize || 0;
      }
      
      // Fallback: estimate based on loaded scenes
      const loadedScenes = Object.values(refs.scenesRef.current).filter(s => s.loaded);
      const estimatedSceneSize = 15 * 1024 * 1024; // ~15MB per scene estimate
      return loadedScenes.length * estimatedSceneSize;
    } catch (error) {
      console.warn('Failed to estimate memory usage:', error);
      return 0;
    }
  }, [refs.scenesRef]);

  // Unload distant scenes to free memory with improved performance management
  const unloadDistantScenes = useCallback(
    async (currentSceneId: string): Promise<void> => {
      try {
        if (!currentSceneId) {
          console.warn('No current scene ID provided for unloading distant scenes');
          return;
        }

        const currentSceneInfo = refs.scenesRef.current[currentSceneId];
        if (!currentSceneInfo) {
          console.warn(`Current scene ${currentSceneId} not found for unloading`);
          return;
        }

        console.log(`Starting cleanup of distant scenes from: ${currentSceneId}`);

        const loadedScenes = Object.values(refs.scenesRef.current).filter(s => s.loaded);
        const currentMemory = await getEstimatedMemoryUsage();
        
        console.log(`Current memory usage: ${(currentMemory / 1024 / 1024).toFixed(2)}MB, Loaded scenes: ${loadedScenes.length}`);

        // Calculate distance threshold based on memory pressure
        let distanceThreshold: number = PERFORMANCE_THRESHOLDS.DISTANCE_THRESHOLD_FAR;
        if (currentMemory > PERFORMANCE_THRESHOLDS.MEMORY_CRITICAL_THRESHOLD) {
          distanceThreshold = PERFORMANCE_THRESHOLDS.DISTANCE_THRESHOLD_CLOSE;
          console.log('Critical memory usage detected, using aggressive cleanup');
        } else if (currentMemory > PERFORMANCE_THRESHOLDS.MEMORY_WARNING_THRESHOLD) {
          distanceThreshold = PERFORMANCE_THRESHOLDS.DISTANCE_THRESHOLD_FAR * 0.7;
          console.log('High memory usage detected, using moderate cleanup');
        }

        // Get connected scenes to avoid unloading them
        const connectedScenes = new Set(
          currentSceneInfo.data.linkHotspots?.map(h => h.target) || []
        );
        connectedScenes.add(currentSceneId); // Don't unload current scene

        const distantScenes = loadedScenes
          .filter(scene => {
            // Don't unload current scene or directly connected scenes
            if (connectedScenes.has(scene.data.id)) {
              return false;
            }

            try {
              const distance = calculateSceneDistance(currentSceneId, scene.data.id);
              return distance > distanceThreshold;
            } catch (distanceError) {
              console.warn(`Failed to calculate distance for scene ${scene.data.id}:`, distanceError);
              return false;
            }
          })
          .map(scene => {
            try {
              return {
                scene,
                distance: calculateSceneDistance(currentSceneId, scene.data.id),
              };
            } catch (distanceError) {
              return {
                scene,
                distance: Infinity,
              };
            }
          })
          .filter(item => item.distance !== Infinity)
          .sort((a, b) => b.distance - a.distance); // Sort by distance (furthest first)

        if (distantScenes.length === 0) {
          console.log('No distant scenes found for unloading');
          return;
        }

        console.log(`Found ${distantScenes.length} distant scenes for potential unloading`);

        let unloadedCount = 0;
        const maxUnloadCount = Math.max(1, Math.floor(distantScenes.length * 0.5)); // Unload up to 50%

        for (const { scene, distance } of distantScenes) {
          if (unloadedCount >= maxUnloadCount) break;

          if (scene.scene) {
            try {
              console.log(`Unloading distant scene: ${scene.data.id} (distance: ${distance.toFixed(2)})`);
              
              // Clear hotspots first
              clearHotspotsForScene(scene);
              
              // Destroy the scene
              scene.scene.destroy();
              scene.scene = null;
              scene.loaded = false;
              
              unloadedCount++;
              console.log(`Successfully unloaded scene: ${scene.data.id}`);
            } catch (error) {
              console.warn(`Error unloading scene ${scene.data.id}:`, error);
            }
          }
        }

        if (unloadedCount > 0) {
          console.log(`Unloaded ${unloadedCount} distant scenes`);
          updatePerformanceStats();
          
          // Log memory usage after cleanup
          const newMemory = await getEstimatedMemoryUsage();
          console.log(`Memory usage after cleanup: ${(newMemory / 1024 / 1024).toFixed(2)}MB`);
        }
      } catch (error) {
        console.error('Error in unloadDistantScenes:', error);
      }
    },
    [refs.scenesRef, calculateSceneDistance, clearHotspotsForScene, updatePerformanceStats, getEstimatedMemoryUsage]
  );

  return {
    preloadAdjacentScenes,
    optimizePerformance,
    unloadDistantScenes,
    getEstimatedMemoryUsage,
  };
}