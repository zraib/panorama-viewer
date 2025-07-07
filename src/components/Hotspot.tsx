'use client';

import { useEffect, useRef, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import styles from './Hotspot.module.css';
import { LinkHotspot } from '@/types/scenes';

interface HotspotProps {
  element: HTMLElement;
  data: LinkHotspot;
  visible: boolean;
  onNavigate: (_sceneId: string, _sourceHotspotYaw: number) => void;
  zoomLevel: number;
}

// This is the actual React component that will be rendered.
// It contains the state and the JSX for the hotspot.
export function HotspotComponent({
  visible,
  data,
  onNavigate,
  style,
}: {
  visible: boolean;
  data: LinkHotspot;
  onNavigate: (_sceneId: string, _sourceHotspotYaw: number) => void;
  style: React.CSSProperties;
}) {
  const [isHovered, setIsHovered] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onNavigate(data.target, data.yaw);
  };

  return (
    <div
      className={`${styles.hotspot} ${visible || isHovered ? styles.visible : ''}`}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={style}
      data-testid='hotspot'
    >
      <div className={styles.arrow}></div>
    </div>
  );
}

export default function Hotspot({
  element,
  data,
  visible,
  onNavigate,
  zoomLevel,
}: HotspotProps) {
  const rootRef = useRef<Root | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isUnmounting = useRef(false);

  // Effect for creating and cleaning up the root
  useEffect(() => {
    isUnmounting.current = false;
    
    if (element) {
      // Create a unique container inside the element
      if (!containerRef.current) {
        containerRef.current = document.createElement('div');
        containerRef.current.style.width = '100%';
        containerRef.current.style.height = '100%';
        element.appendChild(containerRef.current);
      }
      
      // Create root on our container, not the provided element
      if (!rootRef.current && containerRef.current) {
        rootRef.current = createRoot(containerRef.current);
      }
    }

    // Cleanup function
    return () => {
      isUnmounting.current = true;
      
      // Clean up root
      if (rootRef.current) {
        const root = rootRef.current;
        rootRef.current = null;
        setTimeout(() => {
          try {
            root.unmount();
          } catch (e) {
            console.warn('Failed to unmount root:', e);
          }
        }, 0);
      }
      
      // Clean up container
      if (containerRef.current && containerRef.current.parentNode) {
        containerRef.current.parentNode.removeChild(containerRef.current);
        containerRef.current = null;
      }
    };
  }, [element]); // Only recreate when element changes

  // Effect for rendering the hotspot content
  useEffect(() => {
    if (rootRef.current && !isUnmounting.current) {
      // Calculate perspective effects based on distance
      const distance = data.distance || 5; // Default distance if not provided
      const minDistance = 1;
      const maxDistance = 20;

      // Base scaling - closer objects appear larger
      const distanceFactor = 1.5 - ((distance - minDistance) / (maxDistance - minDistance)) * 1.3;
      
      // Zoom adjustment - smaller when zoomed out, larger when zoomed in
      const scaleFactor = distanceFactor * (0.3 + zoomLevel * 0.7);

      // Position adjustment based on zoom - move "forward" when zoomed out
      const zoomOffsetX = (1 - zoomLevel) * -10; // Move left when zooming out
      const zoomOffsetY = (1 - zoomLevel) * -15;

      const hotspotStyle = {
        '--scale-factor': scaleFactor,
        '--oval-factor': 0.6, // More oval for flatter appearance
        '--perspective-rotation': '45deg', // Increased tilt for flat-on-ground effect
        '--zoom-offset-x': `${zoomOffsetX}px`,
        '--zoom-offset-y': `${zoomOffsetY}px`,
      } as React.CSSProperties;

      rootRef.current.render(
        <HotspotComponent
          visible={visible}
          data={data}
          onNavigate={onNavigate}
          style={hotspotStyle}
        />
      );
    }
  }, [data, visible, onNavigate, zoomLevel]);

  return null;
}