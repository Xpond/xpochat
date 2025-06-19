'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface ThreeBackgroundProps {
  className?: string;
}

// Performance constants - easily tunable
const PARTICLE_COUNT = 100; // Reduced from 150
const MAX_DISTANCE = 30;
const MAX_DISTANCE_SQ = MAX_DISTANCE * MAX_DISTANCE; // Pre-calculated for efficiency
const ANIMATION_SPEED = 0.008; // Reduced from 0.01
const ENTROPY_PROBABILITY = 0.001; // Reduced from 0.002
const CHARS_PER_FRAME = 4; // For consistency with streaming system

export default function ThreeBackground({ className = '' }: ThreeBackgroundProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const frameIdRef = useRef<number | null>(null);
  const lastFrameTime = useRef<number>(0);
  const performanceMode = useRef<'high' | 'medium' | 'low'>('high');

  useEffect(() => {
    if (!mountRef.current) return;

    // Performance monitoring
    let frameCount = 0;
    let lastFpsCheck = Date.now();
    
    const checkPerformance = () => {
      const now = Date.now();
      if (now - lastFpsCheck > 1000) {
        const fps = frameCount;
        frameCount = 0;
        lastFpsCheck = now;
        
        // Adaptive quality based on FPS
        if (fps < 30) {
          performanceMode.current = 'low';
        } else if (fps < 50) {
          performanceMode.current = 'medium';
        } else {
          performanceMode.current = 'high';
        }
      }
      frameCount++;
    };

    // Scene setup with optimized settings
    const scene = new THREE.Scene();
    scene.matrixAutoUpdate = false; // Disable automatic matrix updates

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.z = 50;
    camera.matrixAutoUpdate = false;

    // Optimized renderer setup
    const renderer = new THREE.WebGLRenderer({ 
      alpha: true,
      antialias: false, // Disabled for performance
      powerPreference: "high-performance",
      stencil: false,
      depth: false
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 0);
    renderer.sortObjects = false; // Disable sorting for performance
    mountRef.current.appendChild(renderer.domElement);

    // Cached theme colors to avoid repeated DOM queries
    let cachedColors: Float32Array | null = null;
    let lastThemeCheck = 0;
    const THEME_CHECK_INTERVAL = 1000; // Check theme every second

    const getCachedColors = (): Float32Array => {
      const now = Date.now();
      if (!cachedColors || now - lastThemeCheck > THEME_CHECK_INTERVAL) {
        const style = getComputedStyle(document.documentElement);
        const primaryColor = style.getPropertyValue('--teal-primary').trim() || '#1a4a4a';
        const hex = primaryColor.replace('#', '');
        const r = parseInt(hex.slice(0, 2), 16) / 255;
        const g = parseInt(hex.slice(2, 4), 16) / 255;
        const b = parseInt(hex.slice(4, 6), 16) / 255;
        
        // Pre-calculate all color variations as flat array for efficiency
        cachedColors = new Float32Array([
          0.04, 0.04, 0.04,           // Almost black
          0.1, 0.1, 0.1,              // Dark gray
          0.16, 0.16, 0.16,           // Medium dark
          r * 0.6, g * 0.6, b * 0.6,  // Darker theme color
          r, g, b                      // Theme color
        ]);
        lastThemeCheck = now;
      }
      return cachedColors;
    };

    // Optimized particle system - work directly with Float32Arrays
    const particlePositions = new Float32Array(PARTICLE_COUNT * 3);
    const particleVelocities = new Float32Array(PARTICLE_COUNT * 3); // Pre-calculated velocities
    const particleColors = new Float32Array(PARTICLE_COUNT * 3);
    const particlePhases = new Float32Array(PARTICLE_COUNT); // Pre-calculated phase offsets

    // Initialize particles with optimized math
    const colors = getCachedColors();
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3;
      
      // Position
      particlePositions[i3] = (Math.random() - 0.5) * 200;
      particlePositions[i3 + 1] = (Math.random() - 0.5) * 200;
      particlePositions[i3 + 2] = (Math.random() - 0.5) * 200;
      
      // Pre-calculate phase offset for animation
      particlePhases[i] = i * 0.1;
      
      // Assign color from cached palette
      const colorIndex = Math.floor(Math.random() * 5) * 3;
      particleColors[i3] = colors[colorIndex];
      particleColors[i3 + 1] = colors[colorIndex + 1];
      particleColors[i3 + 2] = colors[colorIndex + 2];
    }

    // Create particle geometry
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    particleGeometry.setAttribute('color', new THREE.BufferAttribute(particleColors, 3));

    const particleMaterial = new THREE.PointsMaterial({
      size: 2,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
    });

    const particleSystem = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particleSystem);

    // Optimized line system
    const maxConnections = (PARTICLE_COUNT * (PARTICLE_COUNT - 1)) / 2;
    const linePositionsArray = new Float32Array(maxConnections * 6);
    const lineGeometry = new THREE.BufferGeometry();
    const linePositionAttr = new THREE.BufferAttribute(linePositionsArray, 3);
    lineGeometry.setAttribute('position', linePositionAttr);

    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0x1a4a4a,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
    });

    const lineSystem = new THREE.LineSegments(lineGeometry, lineMaterial);
    scene.add(lineSystem);

    // Optimized line update function using squared distances
    const updateLines = () => {
      let index = 0;
      const skipLines = performanceMode.current === 'low';
      
      if (skipLines) {
        lineGeometry.setDrawRange(0, 0);
        return;
      }

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const i3 = i * 3;
        const x1 = particlePositions[i3];
        const y1 = particlePositions[i3 + 1];
        const z1 = particlePositions[i3 + 2];

        for (let j = i + 1; j < PARTICLE_COUNT; j++) {
          const j3 = j * 3;
          const x2 = particlePositions[j3];
          const y2 = particlePositions[j3 + 1];
          const z2 = particlePositions[j3 + 2];

          // Use squared distance to avoid expensive sqrt
          const dx = x2 - x1;
          const dy = y2 - y1;
          const dz = z2 - z1;
          const distanceSq = dx * dx + dy * dy + dz * dz;

          if (distanceSq < MAX_DISTANCE_SQ) {
            linePositionsArray[index++] = x1;
            linePositionsArray[index++] = y1;
            linePositionsArray[index++] = z1;
            linePositionsArray[index++] = x2;
            linePositionsArray[index++] = y2;
            linePositionsArray[index++] = z2;
          }
        }
      }

      lineGeometry.setDrawRange(0, index / 3);
      linePositionAttr.needsUpdate = true;
    };

    // Optimized theme update with throttling
    let themeUpdateQueued = false;
    const updateTheme = () => {
      if (themeUpdateQueued) return;
      themeUpdateQueued = true;
      
      requestAnimationFrame(() => {
        const colors = getCachedColors();
        
        // Update particle colors
        for (let i = 0; i < PARTICLE_COUNT; i++) {
          const i3 = i * 3;
          const colorIndex = Math.floor(Math.random() * 5) * 3;
          particleColors[i3] = colors[colorIndex];
          particleColors[i3 + 1] = colors[colorIndex + 1];
          particleColors[i3 + 2] = colors[colorIndex + 2];
        }
        particleGeometry.attributes.color.needsUpdate = true;
        
        // Update line color
        const primaryColor = getComputedStyle(document.documentElement)
          .getPropertyValue('--teal-primary').trim() || '#1a4a4a';
        lineMaterial.color.setHex(parseInt(primaryColor.replace('#', '0x')));
        
        themeUpdateQueued = false;
      });
    };

    // Throttled theme observer
    const observer = new MutationObserver(() => updateTheme());
    observer.observe(document.head, { childList: true, subtree: true });

    // Animation variables
    let scrollY = 0;
    let time = 0;

    // Throttled scroll handler
    let scrollUpdateQueued = false;
    const handleScroll = () => {
      if (scrollUpdateQueued) return;
      scrollUpdateQueued = true;
      requestAnimationFrame(() => {
        scrollY = window.scrollY;
        scrollUpdateQueued = false;
      });
    };
    window.addEventListener('scroll', handleScroll, { passive: true });

    // Pre-calculated sine/cosine tables for performance
    const sineTable = new Float32Array(PARTICLE_COUNT);
    const cosineTable = new Float32Array(PARTICLE_COUNT);

    // Optimized animation loop
    const animate = (currentTime: number) => {
      frameIdRef.current = requestAnimationFrame(animate);
      
      // Throttle to 60fps max
      if (currentTime - lastFrameTime.current < 16.67) return;
      lastFrameTime.current = currentTime;
      
      checkPerformance();
      time += ANIMATION_SPEED;

      // Pre-calculate common values
      const timeHalf = time * 0.5;
      const timeOffset = time * 0.05;

      // Update particles with optimized math
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const i3 = i * 3;
        const phase = particlePhases[i];
        
        // Cache sine/cosine calculations
        sineTable[i] = Math.sin(time + phase);
        cosineTable[i] = Math.cos(time + phase);
        
        // Apply gentle floating motion
        particlePositions[i3] += sineTable[i] * 0.02;
        particlePositions[i3 + 1] += cosineTable[i] * 0.02;
        particlePositions[i3 + 2] += Math.sin(timeHalf + timeOffset) * 0.01;

        // Optimized entropy with reduced frequency
        if (Math.random() < ENTROPY_PROBABILITY) {
          particlePositions[i3] += (Math.random() - 0.5) * 2;
          particlePositions[i3 + 1] += (Math.random() - 0.5) * 2;
        }
      }

      // Update particle system
      particleGeometry.attributes.position.needsUpdate = true;

      // Update lines only in high/medium performance mode
      if (performanceMode.current !== 'low') {
        updateLines();
      }

      // Optimized scene rotation
      scene.rotation.y = scrollY * 0.0005;
      scene.rotation.x = scrollY * 0.0002;
      scene.updateMatrix();

      // Optimized camera movement
      camera.position.x = Math.sin(time * 0.2) * 2;
      camera.position.y = Math.cos(time * 0.15) * 1;
      camera.updateMatrix();

      renderer.render(scene, camera);
    };

    // Start animation
    animate(0);

    // Optimized resize handler with debouncing
    let resizeTimeout: NodeJS.Timeout;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      }, 100);
    };
    window.addEventListener('resize', handleResize);

    // Cleanup function
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
      clearTimeout(resizeTimeout);
      
      if (frameIdRef.current) {
        cancelAnimationFrame(frameIdRef.current);
      }
      
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      
      // Thorough cleanup
      particleGeometry.dispose();
      particleMaterial.dispose();
      lineGeometry.dispose();
      lineMaterial.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div 
      ref={mountRef} 
      className={`fixed inset-0 -z-10 ${className}`}
      style={{ pointerEvents: 'none' }}
      suppressHydrationWarning={true}
    />
  );
} 