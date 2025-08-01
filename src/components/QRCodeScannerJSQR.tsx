import { useState, useRef, useEffect } from 'react';
import { X, Camera, Search, AlertCircle } from 'lucide-react';
import jsQR from 'jsqr';

interface QRCodeScannerJSQRProps {
  onScan: (code: string) => void;
  onClose: () => void;
}

declare global {
  interface Window {
    jsQR: any;
  }
}

export default function QRCodeScannerJSQR({ onScan, onClose }: QRCodeScannerJSQRProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string[]>([]);
  const [jsqrReady, setJsqrReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isScanningRef = useRef(false);

  const addDebugMessage = (message: string) => {
    console.log(message);
    setDebugInfo(prev => [...prev.slice(-10), `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  useEffect(() => {
    setJsqrReady(true);
    addDebugMessage('✅ jsQR library imported successfully');
    
    return () => {
      stopScanning();
    };
  }, []);

  const startScanning = async () => {
    if (!videoRef.current || !canvasRef.current) {
      addDebugMessage('❌ Required elements not available');
      return;
    }
    
    try {
      setError(null);
      setIsScanning(true);
      isScanningRef.current = true;
      addDebugMessage('🎥 Starting jsQR camera scan...');
      
      // Request camera permission
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: { ideal: 'environment' },
          width: { ideal: 640 },
          height: { ideal: 480 }
        } 
      });
      
      addDebugMessage('✅ Camera permission granted');
      
      const video = videoRef.current;
      video.srcObject = stream;
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true;
      
      // Wait for video to be ready
      await new Promise<void>((resolve) => {
        const checkReady = () => {
          if (video.readyState >= 2 && video.videoWidth > 0) {
            addDebugMessage(`📹 Video ready: ${video.videoWidth}x${video.videoHeight}`);
            resolve();
          } else {
            setTimeout(checkReady, 100);
          }
        };
        checkReady();
      });
      
      await video.play();
      addDebugMessage('▶️ Video playing successfully');
      
      // Start QR detection with jsQR
      startJSQRDetection();
      
    } catch (err) {
      addDebugMessage(`❌ Camera error: ${err}`);
      setError(`Kamera-Fehler: ${err}`);
    }
  };

  const startJSQRDetection = () => {
    if (!videoRef.current || !canvasRef.current) {
      addDebugMessage('❌ Required elements not available for jsQR detection');
      return;
    }
    
    addDebugMessage('🔍 Starting jsQR detection loop with requestAnimationFrame');
    
    isScanningRef.current = true;
    let attempts = 0;
    let captures = 0;
    
    const detectQRCode = () => {
      // Check if we should continue scanning
      if (!isScanningRef.current) {
        addDebugMessage('🛑 Detection loop stopped (isScanningRef = false)');
        return;
      }
      
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      if (!video || !canvas || video.readyState < 2 || video.videoWidth === 0) {
        if (attempts % 60 === 0) { // Log every 60 frames (~1 second at 60fps)
          addDebugMessage(`⏳ Waiting for video: ready=${video?.readyState}, size=${video?.videoWidth}x${video?.videoHeight}`);
        }
        attempts++;
        animationFrameRef.current = requestAnimationFrame(detectQRCode);
        return;
      }
      
      attempts++;
      
      // Log every 300 attempts (~5 seconds at 60fps)
      if (attempts % 300 === 0) {
        addDebugMessage(`🔄 Detection loop running - attempt ${attempts}`);
      }
      
      try {
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          animationFrameRef.current = requestAnimationFrame(detectQRCode);
          return;
        }
        
        // Update canvas size if needed
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          addDebugMessage(`🖼️ Canvas resized to ${canvas.width}x${canvas.height}`);
        }
        
        // Capture frame
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        captures++;
        
        // Log progress every 180 attempts (~3 seconds at 60fps)
        if (attempts % 180 === 0) {
          addDebugMessage(`📊 jsQR attempt ${attempts}: ${captures} successful captures`);
          
          // Test image brightness
          const testImageData = ctx.getImageData(0, 0, Math.min(100, canvas.width), Math.min(100, canvas.height));
          let brightness = 0;
          for (let i = 0; i < testImageData.data.length; i += 4) {
            brightness += (testImageData.data[i] + testImageData.data[i + 1] + testImageData.data[i + 2]) / 3;
          }
          const avgBrightness = brightness / (testImageData.data.length / 4);
          addDebugMessage(`💡 Image brightness: ${avgBrightness.toFixed(1)} (0=black, 255=white)`);
        }
        
        // Get image data for jsQR - use full image for detection
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        // Method 1: Full image detection with both inversion attempts
        let qrCode = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: "attemptBoth",
        });
        
        // Method 2: If full image fails, try center region as fallback
        if (!qrCode && attempts % 5 === 0) { // Try center region every 5th frame
          const centerX = Math.floor(canvas.width * 0.25);
          const centerY = Math.floor(canvas.height * 0.25);
          const centerW = Math.floor(canvas.width * 0.5);
          const centerH = Math.floor(canvas.height * 0.5);
          
          const centerImageData = ctx.getImageData(centerX, centerY, centerW, centerH);
          qrCode = jsQR(centerImageData.data, centerImageData.width, centerImageData.height, {
            inversionAttempts: "attemptBoth",
          });
          
          if (attempts % 180 === 0) {
            addDebugMessage(`🎯 Fallback: center region ${centerW}x${centerH}`);
          }
        }
        
        if (qrCode) {
          const text = qrCode.data;
          addDebugMessage(`🎯 jsQR QR CODE DETECTED: "${text}"`);
          addDebugMessage(`📍 Location: (${qrCode.location.topLeftCorner.x}, ${qrCode.location.topLeftCorner.y})`);
          addDebugMessage(`📊 Final stats: ${attempts} attempts, ${captures} captures`);
          addDebugMessage(`🔄 Calling onScan callback with: "${text}"`);
          
          // Stop scanning first
          isScanningRef.current = false;
          setIsScanning(false);
          if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
          }
          
          // Then call the callback
          try {
            // Extract order number if it's a URL
            if (text.includes('/order/')) {
              const orderMatch = text.match(/\/order\/([^\/?\s#]+)/);
              if (orderMatch && orderMatch[1]) {
                addDebugMessage(`📋 Extracted order number: ${orderMatch[1]}`);
                onScan(orderMatch[1]);
              } else {
                addDebugMessage(`📋 Using full URL: ${text}`);
                onScan(text);
              }
            } else {
              addDebugMessage(`📋 Using raw code: ${text}`);
              onScan(text);
            }
            addDebugMessage(`✅ onScan callback completed successfully`);
          } catch (callbackError) {
            addDebugMessage(`❌ onScan callback error: ${callbackError}`);
          }
          
          return; // Stop the loop
        }
        
        // Draw QR detection overlay - full screen active area
        ctx.strokeStyle = 'lime';
        ctx.lineWidth = 3;
        
        // Draw full-screen border to show entire area is active
        ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
        
        // Draw corner markers for better visual reference
        const markerSize = 30;
        const margin = 10;
        
        // Top-left
        ctx.strokeRect(margin, margin, markerSize, markerSize);
        // Top-right  
        ctx.strokeRect(canvas.width - margin - markerSize, margin, markerSize, markerSize);
        // Bottom-left
        ctx.strokeRect(margin, canvas.height - margin - markerSize, markerSize, markerSize);
        // Bottom-right
        ctx.strokeRect(canvas.width - margin - markerSize, canvas.height - margin - markerSize, markerSize, markerSize);
        
        // Add text overlay showing full detection
        ctx.fillStyle = 'lime';
        ctx.font = '16px Arial';
        ctx.fillText('Auto-Scan Active', margin + 5, margin + markerSize + 20);
        ctx.fillText(`Attempts: ${attempts}`, margin + 5, margin + markerSize + 40);
        
        // Add crosshairs in center for reference
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const crossSize = 20;
        
        ctx.beginPath();
        ctx.moveTo(centerX - crossSize, centerY);
        ctx.lineTo(centerX + crossSize, centerY);
        ctx.moveTo(centerX, centerY - crossSize);
        ctx.lineTo(centerX, centerY + crossSize);
        ctx.stroke();
        
      } catch (detectionError) {
        if (attempts % 300 === 0) { // Log errors every 300 attempts (~5 seconds)
          addDebugMessage(`⚠️ Detection error (attempt ${attempts}): ${detectionError}`);
        }
      }
      
      // Continue the detection loop
      animationFrameRef.current = requestAnimationFrame(detectQRCode);
    };
    
    // Start the detection loop
    animationFrameRef.current = requestAnimationFrame(detectQRCode);
    addDebugMessage('🚀 jsQR detection loop started with requestAnimationFrame');
  };

  const stopScanning = () => {
    isScanningRef.current = false;
    setIsScanning(false);
    addDebugMessage('🛑 Stopping jsQR scanner');
    
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
      addDebugMessage('🛑 Animation frame cancelled');
    }
    
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
      addDebugMessage('🛑 Scan interval cleared');
    }
    
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
  };

  const testJSQRDirectly = () => {
    addDebugMessage('🧪 Testing jsQR directly...');
    addDebugMessage('✅ jsQR is available and ready for testing');
  };

  const captureCurrentFrame = () => {
    if (!videoRef.current || !canvasRef.current) {
      addDebugMessage('❌ Cannot capture frame - elements not available');
      return;
    }
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    if (!ctx || video.readyState < 2) {
      addDebugMessage('❌ Video not ready for frame capture');
      return;
    }
    
    addDebugMessage('📸 Capturing current frame for analysis...');
    
    // Update canvas
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    
    // Test jsQR with current frame
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const qrCode = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: "attemptBoth",
    });
    
    if (qrCode) {
      addDebugMessage(`🎯 MANUAL CAPTURE SUCCESS: "${qrCode.data}"`);
    } else {
      addDebugMessage('ℹ️ No QR code detected in captured frame');
      
      // Analyze image brightness
      let brightness = 0;
      for (let i = 0; i < imageData.data.length; i += 4) {
        brightness += (imageData.data[i] + imageData.data[i + 1] + imageData.data[i + 2]) / 3;
      }
      const avgBrightness = brightness / (imageData.data.length / 4);
      addDebugMessage(`💡 Frame brightness: ${avgBrightness.toFixed(1)}`);
      
      // Save frame as data URL for inspection
      const dataUrl = canvas.toDataURL();
      addDebugMessage(`📄 Frame saved as data URL (${dataUrl.length} bytes)`);
      
      // Create downloadable link
      const link = document.createElement('a');
      link.download = `camera-frame-${Date.now()}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      addDebugMessage('💾 Frame downloaded as PNG for inspection');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-screen overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">📱 jsQR Scanner</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <X size={24} />
          </button>
        </div>

        {/* jsQR Status */}
        <div className={`p-3 rounded mb-4 ${jsqrReady ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          <div className="flex items-center">
            {jsqrReady ? '✅' : '❌'} jsQR Library: {jsqrReady ? 'Ready' : 'Not Ready'}
          </div>
        </div>

        {/* Controls */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <button
            onClick={testJSQRDirectly}
            className="flex items-center justify-center px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
          >
            🧪 Test jsQR
          </button>
          <button
            onClick={captureCurrentFrame}
            disabled={!isScanning}
            className={`flex items-center justify-center px-3 py-2 rounded text-sm ${
              isScanning
                ? 'bg-purple-500 hover:bg-purple-600 text-white'
                : 'bg-gray-400 text-white cursor-not-allowed'
            }`}
          >
            📸 Capture
          </button>
          <button
            onClick={isScanning ? stopScanning : startScanning}
            disabled={!jsqrReady}
            className={`flex items-center justify-center px-3 py-2 rounded text-sm ${
              isScanning 
                ? 'bg-red-500 hover:bg-red-600 text-white' 
                : jsqrReady
                ? 'bg-green-500 hover:bg-green-600 text-white'
                : 'bg-gray-400 text-white cursor-not-allowed'
            }`}
          >
            <Camera className="mr-1" size={16} />
            {isScanning ? 'Stop' : 'Start'}
          </button>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            <div className="flex items-center">
              <AlertCircle className="mr-2" size={16} />
              {error}
            </div>
          </div>
        )}

        {/* Video and Canvas */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <h3 className="font-semibold mb-2">📹 Live Video</h3>
            <video
              ref={videoRef}
              className="w-full h-40 bg-gray-100 border rounded"
              autoPlay
              playsInline
              muted
            />
          </div>
          <div>
            <h3 className="font-semibold mb-2">🖼️ Processed Canvas</h3>
            <canvas
              ref={canvasRef}
              className="w-full h-40 bg-gray-100 border rounded"
              style={{ objectFit: 'contain' }}
            />
          </div>
        </div>

        {/* Live Canvas Update */}
        {isScanning && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded">
            <div className="text-sm text-blue-700">
              🔴 Live Scanning Active - Canvas updates automatically
            </div>
          </div>
        )}

        {/* Manual Input */}
        <div className="mb-4">
          <div className="flex">
            <input
              type="text"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="Manuell Code eingeben..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-l-md"
            />
            <button
              onClick={() => {
                if (manualCode.trim()) {
                  addDebugMessage(`📝 Manual input: ${manualCode.trim()}`);
                  onScan(manualCode.trim());
                }
              }}
              className="px-4 py-2 bg-blue-500 text-white rounded-r-md hover:bg-blue-600"
            >
              <Search size={20} />
            </button>
          </div>
        </div>

        {/* Debug Log */}
        <div>
          <h3 className="font-semibold mb-2">📋 Debug Log</h3>
          <div className="bg-gray-100 p-3 rounded max-h-40 overflow-y-auto text-sm font-mono">
            {debugInfo.length === 0 ? (
              <div className="text-gray-500">No debug messages yet...</div>
            ) : (
              debugInfo.map((msg, index) => (
                <div key={index} className="mb-1">{msg}</div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
