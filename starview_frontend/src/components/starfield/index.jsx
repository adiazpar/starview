/* Starfield Background Component
 * Combines CSS parallax starfield with interactive canvas layer.
 * Stars near the cursor glow brighter and scale up.
 */

import { useRef, useEffect, useCallback } from 'react';
import './styles.css';

// Configuration
const STAR_CONFIG = {
  density: 0.00015,      // Stars per pixel of screen area
  sizeMin: 1,
  sizeMax: 3,
  alphaMin: 0.2,
  alphaMax: 0.8,
  proximityRange: 150,   // Distance in pixels for interaction
  scaleMax: 2.5,         // Maximum scale when cursor is close
  glowIntensity: 1.5,    // How much brighter stars get near cursor
};

function Starfield() {
  const canvasRef = useRef(null);
  const contextRef = useRef(null);
  const starsRef = useRef([]);
  const mouseRef = useRef({ x: -1000, y: -1000 });
  const animationRef = useRef(null);
  const lastWidthRef = useRef(0); // Track width to avoid mobile viewport jitter

  // Generate random stars based on screen size
  const generateStars = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const starCount = Math.floor(canvas.width * canvas.height * STAR_CONFIG.density);

    starsRef.current = Array.from({ length: starCount }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      baseSize: STAR_CONFIG.sizeMin + Math.random() * (STAR_CONFIG.sizeMax - STAR_CONFIG.sizeMin),
      baseAlpha: STAR_CONFIG.alphaMin + Math.random() * (STAR_CONFIG.alphaMax - STAR_CONFIG.alphaMin),
      currentScale: 1,
      currentAlpha: STAR_CONFIG.alphaMin + Math.random() * (STAR_CONFIG.alphaMax - STAR_CONFIG.alphaMin),
      // Add slight color variation (warm white to cool white)
      hue: Math.random() * 60 + 200, // 200-260 (blue-ish whites)
      saturation: Math.random() * 20,
      lightness: 90 + Math.random() * 10,
    }));
  }, []);

  // Map a value from one range to another
  const mapRange = (value, inMin, inMax, outMin, outMax) => {
    return ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
  };

  // Render stars to canvas
  const render = useCallback(() => {
    const ctx = contextRef.current;
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const { x: mouseX, y: mouseY } = mouseRef.current;

    // Check if light mode is active
    const isLightMode = document.documentElement.getAttribute('data-theme') === 'light';

    starsRef.current.forEach(star => {
      // Calculate distance from mouse
      const dx = star.x - mouseX;
      const dy = star.y - mouseY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Calculate target scale and alpha based on proximity
      let targetScale = 1;
      let targetAlpha = star.baseAlpha;

      if (distance < STAR_CONFIG.proximityRange) {
        // Map distance to scale (closer = bigger)
        targetScale = mapRange(
          distance,
          0,
          STAR_CONFIG.proximityRange,
          STAR_CONFIG.scaleMax,
          1
        );
        // Map distance to alpha (closer = brighter)
        targetAlpha = mapRange(
          distance,
          0,
          STAR_CONFIG.proximityRange,
          Math.min(1, star.baseAlpha * STAR_CONFIG.glowIntensity),
          star.baseAlpha
        );
      }

      // Smooth interpolation (easing)
      star.currentScale += (targetScale - star.currentScale) * 0.15;
      star.currentAlpha += (targetAlpha - star.currentAlpha) * 0.15;

      // Draw star
      const size = star.baseSize * star.currentScale;

      // Use dark colors for light mode, light colors for dark mode
      const lightness = isLightMode ? 20 : star.lightness;
      const alpha = isLightMode ? star.currentAlpha * 0.3 : star.currentAlpha;

      ctx.beginPath();
      ctx.arc(star.x, star.y, size / 2, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${star.hue}, ${star.saturation}%, ${lightness}%, ${alpha})`;
      ctx.fill();

      // Add glow effect for stars near cursor
      if (star.currentScale > 1.2) {
        ctx.beginPath();
        ctx.arc(star.x, star.y, size, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${star.hue}, ${star.saturation}%, ${lightness}%, ${alpha * 0.3})`;
        ctx.fill();
      }
    });

    animationRef.current = requestAnimationFrame(render);
  }, []);

  // Handle mouse/pointer movement
  const handleMouseMove = useCallback((e) => {
    mouseRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  // Handle mouse leave - reset position to off-screen
  const handleMouseLeave = useCallback(() => {
    mouseRef.current = { x: -1000, y: -1000 };
  }, []);

  // Handle touch movement for mobile - continuous interaction while finger is down
  const handleTouchMove = useCallback((e) => {
    if (e.touches.length > 0) {
      const touch = e.touches[0];
      mouseRef.current = { x: touch.clientX, y: touch.clientY };
    }
  }, []);

  // Handle touch start - begin interaction when finger touches screen
  const handleTouchStart = useCallback((e) => {
    if (e.touches.length > 0) {
      const touch = e.touches[0];
      mouseRef.current = { x: touch.clientX, y: touch.clientY };
    }
  }, []);

  // Handle touch end - reset position when finger lifts
  const handleTouchEnd = useCallback(() => {
    mouseRef.current = { x: -1000, y: -1000 };
  }, []);

  // Handle canvas resize
  // Only regenerate stars when width changes to avoid mobile viewport jitter
  // Mobile browsers change height when URL bar/toolbar appears/disappears
  const handleResize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const newWidth = window.innerWidth;
    const newHeight = window.innerHeight;
    const widthChanged = newWidth !== lastWidthRef.current;

    // Always update canvas dimensions for proper rendering
    canvas.width = newWidth;
    canvas.height = newHeight;

    // Only regenerate stars if width changed (actual resize, not mobile toolbar)
    if (widthChanged) {
      lastWidthRef.current = newWidth;
      generateStars();
    }
  }, [generateStars]);

  // Initialize canvas and start animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    contextRef.current = canvas.getContext('2d');
    handleResize();

    // Start animation loop
    animationRef.current = requestAnimationFrame(render);

    // Event listeners
    window.addEventListener('resize', handleResize);
    document.addEventListener('pointermove', handleMouseMove);
    document.addEventListener('pointerleave', handleMouseLeave);

    // Touch event listeners for mobile - passive to allow scrolling
    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });
    document.addEventListener('touchcancel', handleTouchEnd, { passive: true });

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('pointermove', handleMouseMove);
      document.removeEventListener('pointerleave', handleMouseLeave);
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [handleResize, render, handleMouseMove, handleMouseLeave, handleTouchStart, handleTouchMove, handleTouchEnd]);

  return (
    <div className="starfield" aria-hidden="true">
      {/* CSS parallax star layers */}
      <div className="stars-sm"></div>
      <div className="stars-md"></div>
      <div className="stars-lg"></div>

      {/* Shooting stars */}
      <div className="shooting-star"></div>
      <div className="shooting-star"></div>
      <div className="shooting-star"></div>
      <div className="shooting-star"></div>
      <div className="shooting-star"></div>

      {/* Interactive canvas layer */}
      <canvas ref={canvasRef} className="starfield-canvas" />
    </div>
  );
}

export default Starfield;
