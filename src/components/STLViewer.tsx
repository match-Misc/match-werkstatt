import { Suspense, useRef, useEffect, useState } from 'react';
import { Canvas, useLoader } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { STLLoader } from 'three-stdlib';
import * as THREE from 'three';
import { ErrorBoundary } from './ErrorBoundary';

interface STLViewerProps {
  fileUrl: string;
  fileName: string;
  className?: string;
  showControls?: boolean;
}

function Model3D({ url }: { url: string }) {
  const meshRef = useRef<THREE.Mesh>(null);
  
  const geometry = useLoader(STLLoader, url);
  
  useEffect(() => {
    if (geometry && meshRef.current) {
      // Zentriere das Modell
      geometry.center();
      
      // Berechne Bounding Box für automatische Kamera-Positionierung
      const box = new THREE.Box3().setFromObject(meshRef.current);
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      
      // Normalisiere die Größe falls nötig
      if (maxDim > 10) {
        const scale = 10 / maxDim;
        meshRef.current.scale.setScalar(scale);
      }
    }
  }, [geometry]);

  return (
    <mesh ref={meshRef} geometry={geometry}>
      <meshStandardMaterial 
        color="#4f46e5" 
        metalness={0.2} 
        roughness={0.3}
        wireframe={false}
      />
    </mesh>
  );
}

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center h-96 bg-gray-50 rounded-lg">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">3D-Modell wird geladen...</p>
      </div>
    </div>
  );
}

function ErrorFallback({ fileName }: { fileName: string }) {
  return (
    <div className="flex items-center justify-center h-96 bg-red-50 rounded-lg border border-red-200">
      <div className="text-center">
        <div className="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
          <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 19.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-red-800 mb-2">Fehler beim Laden</h3>
        <p className="text-red-600 text-sm">
          Die STL-Datei "{fileName}" konnte nicht geladen werden.
        </p>
        <p className="text-red-500 text-xs mt-2">
          Bitte überprüfen Sie, ob die Datei gültig ist.
        </p>
      </div>
    </div>
  );
}

function STLViewer({ 
  fileUrl, 
  fileName, 
  className = '', 
  showControls = true 
}: STLViewerProps) {
  const [hasError, setHasError] = useState(false);

  const handleError = () => {
    setHasError(true);
  };

  if (hasError) {
    return <ErrorFallback fileName={fileName} />;
  }

  return (
    <div className={`bg-white rounded-lg border ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium text-gray-900">3D-Ansicht</h3>
            <p className="text-sm text-gray-600">{fileName}</p>
          </div>
          {showControls && (
            <div className="text-xs text-gray-500">
              <p>🖱️ Linke Maustaste: Drehen</p>
              <p>🖱️ Mittlere Maustaste: Zoomen</p>
              <p>🖱️ Rechte Maustaste: Verschieben</p>
            </div>
          )}
        </div>
      </div>
      
      {/* 3D Viewer */}
      <div className="h-96 relative">
        <ErrorBoundary
          fallback={
            <div className="flex items-center justify-center h-full bg-gray-50">
              <div className="text-center">
                <p className="text-red-600 mb-2">Fehler beim Laden der 3D-Datei</p>
                <p className="text-sm text-gray-500">
                  Die STL-Datei konnte nicht geladen werden.
                </p>
              </div>
            </div>
          }
        >
          <Canvas
            onError={handleError}
          dpr={[1, 2]}
          gl={{ 
            antialias: true,
            alpha: true,
            preserveDrawingBuffer: true 
          }}
        >
          {/* Kamera */}
          <PerspectiveCamera makeDefault position={[10, 10, 10]} fov={50} />
          
          {/* Beleuchtung */}
          <ambientLight intensity={0.6} />
          <directionalLight position={[10, 10, 5]} intensity={0.8} />
          <directionalLight position={[-10, -10, -5]} intensity={0.4} />
          
          {/* Controls */}
          {showControls && (
            <OrbitControls 
              enablePan={true}
              enableZoom={true}
              enableRotate={true}
              maxDistance={50}
              minDistance={1}
            />
          )}
          
          {/* 3D Model */}
          <Suspense fallback={null}>
            <Model3D url={fileUrl} />
          </Suspense>
        </Canvas>
        </ErrorBoundary>
        
        {/* Loading Overlay */}
        <Suspense fallback={<LoadingFallback />}>
          <div />
        </Suspense>
      </div>
      
      {/* Footer Info */}
      <div className="p-3 bg-blue-50 border-t border-blue-100">
        <div className="flex items-center text-xs text-blue-700">
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>Interaktive 3D-Ansicht der STL-Datei. Verwenden Sie die Maus zur Navigation.</span>
        </div>
      </div>
    </div>
  );
}

export default STLViewer;
