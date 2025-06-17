'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface ThreeBackgroundProps {
  className?: string;
}

export default function ThreeBackground({ className = '' }: ThreeBackgroundProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const frameIdRef = useRef<number | null>(null);
  const particleColorsRef = useRef<Float32Array | null>(null);
  const particleGeometryRef = useRef<THREE.BufferGeometry | null>(null);
  const lineMaterialRef = useRef<THREE.LineBasicMaterial | null>(null);

  useEffect(() => {
    if (!mountRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.z = 50;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ 
      alpha: true,
      antialias: true 
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 0);
    rendererRef.current = renderer;
    mountRef.current.appendChild(renderer.domElement);

    // Function to get current theme colors
    const getCurrentColors = () => {
      const style = getComputedStyle(document.documentElement);
      const primaryColor = style.getPropertyValue('--teal-primary').trim() || '#1a4a4a';
      const hex = primaryColor.replace('#', '');
      const r = parseInt(hex.slice(0, 2), 16) / 255;
      const g = parseInt(hex.slice(2, 4), 16) / 255;
      const b = parseInt(hex.slice(4, 6), 16) / 255;
      
      return [
        new THREE.Color(0x0a0a0a), // Almost black
        new THREE.Color(0x1a1a1a), // Dark gray
        new THREE.Color(0x2a2a2a), // Medium dark
        new THREE.Color(r * 0.6, g * 0.6, b * 0.6), // Darker theme color
        new THREE.Color(r, g, b), // Theme color
      ];
    };

    // Create particles
    const particleCount = 150;
    const particles: THREE.Vector3[] = [];
    const particleGeometry = new THREE.BufferGeometry();
    const particlePositions = new Float32Array(particleCount * 3);
    const particleColors = new Float32Array(particleCount * 3);
    
    particleColorsRef.current = particleColors;
    particleGeometryRef.current = particleGeometry;

    // Function to update particle colors
    const updateParticleColors = () => {
      const colors = getCurrentColors();
      for (let i = 0; i < particleCount; i++) {
        const color = colors[Math.floor(Math.random() * colors.length)];
        particleColors[i * 3] = color.r;
        particleColors[i * 3 + 1] = color.g;
        particleColors[i * 3 + 2] = color.b;
      }
      if (particleGeometry.attributes.color) {
        particleGeometry.attributes.color.needsUpdate = true;
      }
    };

    for (let i = 0; i < particleCount; i++) {
      const x = (Math.random() - 0.5) * 200;
      const y = (Math.random() - 0.5) * 200;
      const z = (Math.random() - 0.5) * 200;
      
      particles.push(new THREE.Vector3(x, y, z));
      
      particlePositions[i * 3] = x;
      particlePositions[i * 3 + 1] = y;
      particlePositions[i * 3 + 2] = z;
    }

    updateParticleColors();

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

    // Create connecting lines between nearby particles
    const lineGeometry = new THREE.BufferGeometry();

    // Pre-allocate a buffer large enough to hold the maximum possible number of
    // positions for all potential line segments between particles. Each
    // connection requires 2 vertices (start & end) → 6 float values.
    const maxConnections = (particleCount * (particleCount - 1)) / 2;
    const linePositionsArray = new Float32Array(maxConnections * 6);
    // Create the attribute once and reuse it every frame.
    const linePositionAttr = new THREE.BufferAttribute(linePositionsArray, 3);
    lineGeometry.setAttribute('position', linePositionAttr);

    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0x1a4a4a,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
    });
    lineMaterialRef.current = lineMaterial;

    // Function to update line color
    const updateLineColor = () => {
      const style = getComputedStyle(document.documentElement);
      const primaryColor = style.getPropertyValue('--teal-primary').trim() || '#1a4a4a';
      lineMaterial.color.setHex(parseInt(primaryColor.replace('#', '0x')));
    };

    const updateLines = () => {
      const maxDistance = 30;
      let index = 0; // Tracks position in the pre-allocated array

      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const distance = particles[i].distanceTo(particles[j]);
          if (distance < maxDistance) {
            // Start vertex
            linePositionsArray[index++] = particles[i].x;
            linePositionsArray[index++] = particles[i].y;
            linePositionsArray[index++] = particles[i].z;
            // End vertex
            linePositionsArray[index++] = particles[j].x;
            linePositionsArray[index++] = particles[j].y;
            linePositionsArray[index++] = particles[j].z;
          }
        }
      }

      // Update draw range to the number of vertices we actually filled.
      lineGeometry.setDrawRange(0, index / 3);
      // Inform Three.js that the underlying buffer changed.
      linePositionAttr.needsUpdate = true;
    };

    updateLines();
    const lineSystem = new THREE.LineSegments(lineGeometry, lineMaterial);
    scene.add(lineSystem);

    // Listen for theme changes
    const observer = new MutationObserver(() => {
      updateParticleColors();
      updateLineColor();
    });
    observer.observe(document.head, { childList: true, subtree: true });

    // Animation variables
    let scrollY = 0;
    let time = 0;

    // Handle scroll
    const handleScroll = () => {
      scrollY = window.scrollY;
    };
    window.addEventListener('scroll', handleScroll);

    // Animation loop
    const animate = () => {
      frameIdRef.current = requestAnimationFrame(animate);
      time += 0.01;

      // Animate particles with entropy simulation
      for (let i = 0; i < particles.length; i++) {
        // Add gentle floating motion
        particles[i].x += Math.sin(time + i * 0.1) * 0.02;
        particles[i].y += Math.cos(time + i * 0.1) * 0.02;
        particles[i].z += Math.sin(time * 0.5 + i * 0.05) * 0.01;

        // Update particle positions
        particlePositions[i * 3] = particles[i].x;
        particlePositions[i * 3 + 1] = particles[i].y;
        particlePositions[i * 3 + 2] = particles[i].z;

        // Add entropy by occasionally shifting particles
        if (Math.random() < 0.002) {
          particles[i].x += (Math.random() - 0.5) * 2;
          particles[i].y += (Math.random() - 0.5) * 2;
        }
      }

      // Update particle system
      particleGeometry.attributes.position.needsUpdate = true;

      // Update connecting lines
      updateLines();

      // Rotate entire scene based on scroll
      scene.rotation.y = scrollY * 0.0005;
      scene.rotation.x = scrollY * 0.0002;

      // Camera movement
      camera.position.x = Math.sin(time * 0.2) * 2;
      camera.position.y = Math.cos(time * 0.15) * 1;

      renderer.render(scene, camera);
    };

    animate();

    // Handle resize
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
      
      if (frameIdRef.current) {
        cancelAnimationFrame(frameIdRef.current);
      }
      
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      
      renderer.dispose();
      particleGeometry.dispose();
      particleMaterial.dispose();
      lineGeometry.dispose();
      lineMaterial.dispose();
    };
  }, []);

  return (
    <div 
      ref={mountRef} 
      className="fixed inset-0 -z-10"
      style={{ pointerEvents: 'none' }}
      suppressHydrationWarning={true}
    />
  );
} 