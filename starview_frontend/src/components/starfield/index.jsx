/* Starfield Background Component
 * Combines CSS parallax starfield with interactive canvas layer.
 * Stars near the cursor glow brighter and scale up.
 */

import { useRef, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import './styles.css';

// Pages where the starfield should be hidden (solid background pages)
const HIDDEN_ON_PATHS = ['/privacy', '/terms', '/accessibility', '/ccpa'];

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
  const location = useLocation();
  const canvasRef = useRef(null);
  const contextRef = useRef(null);
  const starsRef = useRef([]);
  const mouseRef = useRef({ x: -1000, y: -1000 });
  const animationRef = useRef(null);
  const initializedRef = useRef(false); // Track if canvas has been initialized

  // Don't render on pages with solid backgrounds
  const isHidden = HIDDEN_ON_PATHS.includes(location.pathname);

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

  // Handle mouse movement (desktop only)
  const handleMouseMove = useCallback((e) => {
    mouseRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  // Handle mouse leave - reset position to off-screen
  const handleMouseLeave = useCallback(() => {
    mouseRef.current = { x: -1000, y: -1000 };
  }, []);

  // Handle canvas initialization and resize
  // Only resize on width changes (device rotation) to avoid mobile viewport jitter
  // Mobile browsers constantly change height when URL bar/toolbar appears/disappears
  const handleResize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const newWidth = window.innerWidth;

    // First initialization - set canvas size once with extra height buffer
    if (!initializedRef.current) {
      // Use larger of screen dimensions to ensure coverage during rotation
      const maxDimension = Math.max(window.screen.width, window.screen.height);
      canvas.width = newWidth;
      canvas.height = maxDimension + 200; // Extra buffer for toolbar areas
      initializedRef.current = true;
      generateStars();
      return;
    }

    // Only resize if width changed (device rotation, not toolbar)
    // Changing canvas dimensions clears the buffer, so avoid unnecessary changes
    if (newWidth !== canvas.width) {
      const maxDimension = Math.max(window.screen.width, window.screen.height);
      canvas.width = newWidth;
      canvas.height = maxDimension + 200;
      generateStars();
    }
  }, [generateStars]);

  // Initialize canvas and start animation
  useEffect(() => {
    // Don't initialize if hidden
    if (isHidden) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    contextRef.current = canvas.getContext('2d');
    handleResize();

    // Start animation loop
    animationRef.current = requestAnimationFrame(render);

    // Event listeners - mouse only (no touch interaction on mobile)
    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [isHidden, handleResize, render, handleMouseMove, handleMouseLeave]);

  // Don't render on hidden pages
  if (isHidden) {
    return null;
  }

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
