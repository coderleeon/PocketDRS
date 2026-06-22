'use client';

import { useState, useEffect } from 'react';

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cv: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Module: any;
  }
}

export function useOpenCV() {
  const [loaded, setLoaded] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // If already loaded, return immediately
    if (window.cv && typeof window.cv.Mat === 'function') {
      Promise.resolve().then(() => {
        setLoaded(true);
      });
      return;
    }

    // Prepare OpenCV module config
    if (!window.Module) {
      window.Module = {};
    }

    const originalRuntimeInitialized = window.Module.onRuntimeInitialized;
    window.Module.onRuntimeInitialized = () => {
      if (originalRuntimeInitialized) {
        originalRuntimeInitialized();
      }
      setLoaded(true);
    };

    const scriptId = 'opencv-cdn-script';
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;

    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      // Using a stable OpenCV.js CDN URL (version 4.10.0)
      script.src = 'https://docs.opencv.org/4.10.0/opencv.js';
      script.async = true;
      script.type = 'text/javascript';
      
      script.onload = () => {
        // Fallback check if onRuntimeInitialized didn't trigger
        const interval = setInterval(() => {
          if (window.cv && typeof window.cv.Mat === 'function') {
            setLoaded(true);
            clearInterval(interval);
          }
        }, 100);
        
        // Timeout check after 10 seconds
        setTimeout(() => {
          clearInterval(interval);
        }, 10000);
      };

      script.onerror = () => {
        setError('Failed to load OpenCV.js script from CDN.');
      };

      document.body.appendChild(script);
    } else {
      // Script is already in DOM, check regularly for readiness
      const interval = setInterval(() => {
        if (window.cv && typeof window.cv.Mat === 'function') {
          setLoaded(true);
          clearInterval(interval);
        }
      }, 100);

      setTimeout(() => {
        clearInterval(interval);
      }, 5000);
    }
  }, []);

  return { loaded, error };
}
