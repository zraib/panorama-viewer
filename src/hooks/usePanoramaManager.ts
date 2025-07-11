import { useCallback, useEffect, useRef } from 'react';
import { usePanoramaViewer } from './usePanoramaViewer';
import { useSceneManager } from './useSceneManager';
import { useHotspotManager } from './useHotspotManager';
import { usePerformanceManager } from './usePerformanceManager';
import { useViewerEvents } from './useViewerEvents';
import { checkWebGLSupport, getWebGLDiagnostics } from '@/utils/panoramaUtils';
import { ConfigData } from '@/types/scenes';

interface UsePanoramaManagerProps {
  projectId?: string;
  initialSceneId?: string;
  closePanels?: (() => void);
}

export function usePanoramaManager({ projectId, initialSceneId, closePanels }: UsePanoramaManagerProps) {
  const { state, refs, actions, router } = usePanoramaViewer();
  
  // Navigation queue to prevent race conditions
  const navigationQueueRef = useRef<string[]>([]);
  const isNavigatingRef = useRef<boolean>(false);
  
  const { clearHotspotsForScene, createHotspotsForScene, toggleHotspots } = useHotspotManager({
    refs,
    actions,
    hotspotsVisible: state.hotspotsVisible,
  });

  const {
    calculateSceneDistance,
    updatePerformanceStats,
    loadScene,
    switchScene,
  } = useSceneManager({
    refs,
    actions,
    projectId,
    currentScene: state.currentScene,
    currentViewParams: state.currentViewParams,
  });

  const { preloadAdjacentScenes, optimizePerformance } = usePerformanceManager({
    refs,
    actions,
    projectId,
    currentScene: state.currentScene,
    calculateSceneDistance,
    loadScene,
    clearHotspotsForScene,
    updatePerformanceStats,
  });

  // Consolidated switchScene function
  const switchSceneWithHooks = useCallback(
    async (
      sceneId: string,
      isInitial: boolean = false,
      preserveViewDirection: boolean = false
    ): Promise<void> => {
      await switchScene(
        sceneId,
        isInitial,
        preserveViewDirection,
        clearHotspotsForScene,
        createHotspotsForScene,
        preloadAdjacentScenes
      );
    },
    [switchScene, clearHotspotsForScene, createHotspotsForScene, preloadAdjacentScenes]
  );

  // Initialize viewer function
  const initializeViewer = useCallback(async () => {
    try {
      if (!checkWebGLSupport()) {
        const diagnostics = getWebGLDiagnostics();
        console.error('WebGL Diagnostics:', diagnostics);
        throw new Error(
          `WebGL is not supported or disabled in your browser. Diagnostics: ${diagnostics}`
        );
      }

      const configUrl = projectId
        ? `/api/projects/${encodeURIComponent(projectId)}/config`
        : '/config.json';
      const response = await fetch(configUrl);
      if (!response.ok) {
        throw new Error(`Failed to load config: ${response.statusText}`);
      }

      const configData = (await response.json()) as ConfigData;
      actions.setConfig(configData);

      const Marzipano = (window as any).Marzipano;
      if (!Marzipano) {
        throw new Error('Marzipano library not loaded');
      }

      const viewerOpts = {
        controls: { mouseViewMode: 'drag' },
        stage: { progressive: true },
      };

      if (!refs.panoRef.current) {
        throw new Error('Panorama container not found');
      }

      const viewer = new Marzipano.Viewer(refs.panoRef.current, viewerOpts);
      refs.viewerRef.current = viewer;

      // Setup view parameter tracking for preserving view direction
      setupViewTracking(viewer);

      configData.scenes.forEach(sceneData => {
        refs.scenesRef.current[sceneData.id] = {
          data: sceneData,
          scene: null,
          hotspotElements: [],
          loaded: false,
        };
      });

      if (configData.scenes.length > 0) {
        let targetScene = configData.scenes[0];
        if (initialSceneId) {
          const foundScene = configData.scenes.find(s => s.id === initialSceneId);
          if (foundScene) targetScene = foundScene;
        }

        await loadScene(targetScene.id, 'high');
        await switchSceneWithHooks(targetScene.id, true, false);
      }

      actions.setIsLoading(false);
      setTimeout(() => actions.setShowTapHint(true), 1000);
      setTimeout(() => actions.setShowTapHint(false), 4000);
    } catch (err) {
      console.error('Initialization error:', err);
      actions.setError(err instanceof Error ? err.message : String(err));
      actions.setIsLoading(false);
    }
  }, [loadScene, switchSceneWithHooks, actions, refs, initialSceneId, projectId]);

  // Process navigation queue to prevent race conditions
  const processNavigationQueue = useCallback(async () => {
    if (isNavigatingRef.current || navigationQueueRef.current.length === 0) {
      return;
    }

    isNavigatingRef.current = true;
    const sceneId = navigationQueueRef.current.shift()!;

    try {
      // Check if viewer is properly initialized
      if (!refs.viewerRef.current) {
        console.error('Navigation failed: Viewer not initialized');
        actions.setError('Failed to initialize panorama viewer');
        return;
      }

      // Validate scene exists
      const sceneInfo = refs.scenesRef.current[sceneId];
      if (!sceneInfo) {
        console.error(`Navigation failed: Scene ${sceneId} not found`);
        actions.setError(`Scene ${sceneId} not found`);
        return;
      }

      // Skip if already on this scene
      if (sceneId === state.currentScene) {
        console.log(`Navigation skipped: already on scene ${sceneId}`);
        return;
      }

      console.log(`Processing navigation to scene: ${sceneId}`);

      // Preload image if scene info exists
      if (sceneInfo) {
        const img = new Image();
        const imagePath = projectId
          ? `/api/files/${projectId}/images/${sceneId}-pano.jpg`
          : `/api/files/images/${sceneId}-pano.jpg`;
        img.src = imagePath;

        await new Promise<void>(resolve => {
          img.onload = () => resolve();
          img.onerror = () => resolve();
        });

        if (!sceneInfo.loaded) {
          await loadScene(sceneId, 'high');
        }
      }

      // Update URL before scene switch
      if (projectId) {
        const newUrl = `/${projectId}/${sceneId}`;
        window.history.replaceState(null, '', newUrl);
      }

      // Perform the scene switch
      await switchSceneWithHooks(sceneId, false, true);
      console.log(`Navigation completed successfully to scene: ${sceneId}`);
    } catch (error) {
      console.error(`Navigation failed for scene ${sceneId}:`, error);
      actions.setError(`Failed to navigate to scene: ${sceneId}`);
    } finally {
      isNavigatingRef.current = false;
      // Process next item in queue if any
      if (navigationQueueRef.current.length > 0) {
        setTimeout(() => processNavigationQueue(), 100);
      }
    }
  }, [switchSceneWithHooks, state.currentScene, loadScene, projectId, refs.scenesRef, refs.viewerRef, actions]);

  // Navigate to scene function with queue-based race condition prevention
  const navigateToScene = useCallback(
    async (sceneId: string, sourceHotspotYaw?: number): Promise<void> => {
      // Skip if already on this scene or scene doesn't exist
      if (sceneId === state.currentScene || !refs.scenesRef.current[sceneId]) {
        console.log(`Navigation ignored: ${sceneId === state.currentScene ? 'same scene' : 'scene not found'}`);
        return;
      }

      // Remove any existing instances of this scene from queue
      navigationQueueRef.current = navigationQueueRef.current.filter(id => id !== sceneId);
      
      // Add to queue
      navigationQueueRef.current.push(sceneId);
      console.log(`Scene ${sceneId} added to navigation queue. Queue length: ${navigationQueueRef.current.length}`);

      // Process queue
      processNavigationQueue();
    },
    [state.currentScene, refs.scenesRef, processNavigationQueue]
  );

  const {
    handlePanoClick,
    handleMarzipanoLoad,
    handleRetry,
    setupViewTracking,
  } = useViewerEvents({
    refs,
    actions,
    isLoading: state.isLoading,
    currentScene: state.currentScene,
    toggleHotspots,
    initializeViewer,
    closePanels,
  });

  return {
    state,
    refs,
    actions,
    navigateToScene,
    optimizePerformance,
    handlePanoClick,
    handleMarzipanoLoad,
    handleRetry,
    toggleHotspots,
  };
}