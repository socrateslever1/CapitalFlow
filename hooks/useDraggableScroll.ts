import React, { useRef, useState, useCallback } from 'react';

/**
 * Hook to enable click-and-drag horizontal scrolling on desktop.
 * Useful for horizontal filter bars.
 */
export const useDraggableScroll = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [hasMoved, setHasMoved] = useState(false);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (!ref.current) return;
    
    // Only drag with left mouse button
    if (e.button !== 0) return;

    setIsDragging(true);
    setStartX(e.pageX - ref.current.offsetLeft);
    setScrollLeft(ref.current.scrollLeft);
    setHasMoved(false);
    
    // Change cursor to grabbing
    ref.current.style.cursor = 'grabbing';
    ref.current.style.userSelect = 'none';
  }, []);

  const onMouseLeave = useCallback(() => {
    if (!ref.current) return;
    if (isDragging) {
      setIsDragging(false);
      ref.current.style.cursor = 'grab';
      ref.current.style.removeProperty('user-select');
    }
  }, [isDragging]);

  const onMouseUp = useCallback(() => {
    if (!ref.current) return;
    if (isDragging) {
      setIsDragging(false);
      ref.current.style.cursor = 'grab';
      ref.current.style.removeProperty('user-select');
      
      // Reset hasMoved after a short delay to allow click events to be blocked if needed
      // but usually the onClickCapture handles it immediately.
    }
  }, [isDragging]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging || !ref.current) return;
    
    e.preventDefault();
    const x = e.pageX - ref.current.offsetLeft;
    const walk = (x - startX) * 1.5; // Multiplier for scroll speed
    
    if (Math.abs(walk) > 5) {
      setHasMoved(true);
    }
    
    ref.current.scrollLeft = scrollLeft - walk;
  }, [isDragging, startX, scrollLeft]);

  // This can be used to prevent click events if the mouse has moved significantly
  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (hasMoved) {
      e.stopPropagation();
      e.preventDefault();
    }
  }, [hasMoved]);

  return {
    ref,
    onMouseDown,
    onMouseLeave,
    onMouseUp,
    onMouseMove,
    onClickCapture,
    isDragging
  };
};
