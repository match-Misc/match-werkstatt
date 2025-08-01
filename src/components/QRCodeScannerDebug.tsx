import { useState, useRef, useEffect } from 'react';
import { BrowserMultiFormatReader } from '@zxing/library';
import { X, Camera, Search, AlertCircle } from 'lucide-react';

interface QRCodeScannerDebugProps {
  onScan: (code: string) => void;
  onClose: () => void;
}

export default function QRCodeScannerDebug({ onScan, onClose }: QRCodeScannerDebugProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string[]>([]);
  const [zxingReady, setZxingReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const codeReader = useRef<BrowserMultiFormatReader | null>(null);
  const debugCanvasRef = useRef<HTMLCanvasElement>(null);

  const addDebugMessage = (message: string) => {
    console.log(message);
    setDebugInfo(prev => [...prev.slice(-10), `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  useEffect(() => {
    // Test ZXing initialization
    try {
      codeReader.current = new BrowserMultiFormatReader();
      setZxingReady(true);
      addDebugMessage('✅ ZXing BrowserMultiFormatReader initialized successfully');
      addDebugMessage('🔧 ZXing reader ready for decoding');
      
    } catch (error) {
      addDebugMessage(`❌ ZXing initialization failed: ${error}`);
      setError('ZXing library initialization failed');
    }
    
    return () => {
      if (isScanning) {
        setIsScanning(false);
        if (videoRef.current?.srcObject) {
          const stream = videoRef.current.srcObject as MediaStream;
          stream.getTracks().forEach(track => track.stop());
          videoRef.current.srcObject = null;
        }
      }
    };
  }, []);

  const startScanning = async () => {
    if (!videoRef.current || !codeReader.current) {
      addDebugMessage('❌ Video element or code reader not available');
      return;
    }
    
    try {
      setError(null);
      setIsScanning(true);
      addDebugMessage('🎥 Starting camera scan...');
      
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
      
      // Start QR detection
      setTimeout(() => {
        if (isScanning) {
          startQRDetection();
        }
      }, 1000);
      
    } catch (err) {
      addDebugMessage(`❌ Camera error: ${err}`);
      setError(`Kamera-Fehler: ${err}`);
    }
  };

  const startQRDetection = () => {
    if (!videoRef.current || !codeReader.current || !debugCanvasRef.current) {
      addDebugMessage('❌ Required elements not available for QR detection');
      return;
    }
    
    addDebugMessage('🔍 Starting QR detection loop');
    
    const video = videoRef.current;
    const canvas = debugCanvasRef.current;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      addDebugMessage('❌ Canvas context not available');
      return;
    }
    
    let attempts = 0;
    let captures = 0;
    
    const detect = async () => {
      if (!isScanning || !video || !codeReader.current) return;
      
      attempts++;
      
      if (video.readyState >= 2 && video.videoWidth > 0) {
        // Update canvas size if needed
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          addDebugMessage(`🖼️ Canvas resized to ${canvas.width}x${canvas.height}`);
        }
        
        try {
          // Capture frame
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          captures++;
          
          // Log progress every 20 attempts
          if (attempts % 20 === 0) {
            addDebugMessage(`📊 Attempt ${attempts}: ${captures} successful captures`);
          }
          
          // Try to decode - Create an Image element for ZXing
          const imageData = canvas.toDataURL('image/png');
          const img = new Image();
          
          img.onload = async () => {
            try {
              const result = await codeReader.current!.decodeFromImageElement(img);
              const text = result.getText();
              addDebugMessage(`🎯 QR CODE DETECTED: "${text}"`);
              addDebugMessage(`📍 Result points: ${result.getResultPoints()?.length || 0}`);
              
              stopScanning();
              
              // Extract order number if it's a URL
              if (text.includes('/order/')) {
                const orderMatch = text.match(/\/order\/([^\/?\s#]+)/);
                if (orderMatch && orderMatch[1]) {
                  addDebugMessage(`📋 Extracted order number: ${orderMatch[1]}`);
                  onScan(orderMatch[1]);
                } else {
                  onScan(text);
                }
              } else {
                onScan(text);
              }
              return;
            } catch (decodeError) {
              // Only log unexpected errors
              if (decodeError instanceof Error && 
                  !decodeError.name.includes('NotFound') && 
                  !decodeError.message.includes('No MultiFormat')) {
                addDebugMessage(`⚠️ Decode error: ${decodeError.name} - ${decodeError.message}`);
              }
            }
          };
          
          img.onerror = () => {
            addDebugMessage('❌ Image load failed');
          };
          
          img.src = imageData;
          
        } catch (captureError) {
          addDebugMessage(`❌ Frame capture error: ${captureError}`);
        }
      } else {
        if (attempts % 10 === 0) {
          addDebugMessage(`⏳ Video not ready: state=${video.readyState}, size=${video.videoWidth}x${video.videoHeight}`);
        }
      }
      
      // Continue scanning
      if (isScanning) {
        setTimeout(detect, 200); // Slower for debugging
      }
    };
    
    // Start detection
    setTimeout(() => {
      addDebugMessage('🚀 Starting QR detection loop');
      detect();
    }, 500);
  };

  const stopScanning = () => {
    setIsScanning(false);
    addDebugMessage('🛑 Stopping scanner');
    
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
  };

  const testZXingDirectly = async () => {
    if (!codeReader.current) {
      addDebugMessage('❌ ZXing not initialized');
      return;
    }
    
    addDebugMessage('🧪 Testing ZXing directly with test image...');
    
    // Create a simple test image
    const testCanvas = document.createElement('canvas');
    const testCtx = testCanvas.getContext('2d');
    testCanvas.width = 200;
    testCanvas.height = 200;
    
    if (testCtx) {
      // Draw a simple test pattern
      testCtx.fillStyle = 'white';
      testCtx.fillRect(0, 0, 200, 200);
      testCtx.fillStyle = 'black';
      testCtx.fillText('TEST PATTERN', 50, 100);
      
      const img = new Image();
      img.onload = async () => {
        try {
          const result = await codeReader.current!.decodeFromImageElement(img);
          addDebugMessage(`🧪 Test decode result: ${result.getText()}`);
        } catch (error) {
          addDebugMessage(`🧪 Test decode failed (expected for test pattern): ${error}`);
        }
      };
      img.src = testCanvas.toDataURL();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-screen overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">🐛 QR Code Scanner Debug</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <X size={24} />
          </button>
        </div>

        {/* ZXing Status */}
        <div className={`p-3 rounded mb-4 ${zxingReady ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          <div className="flex items-center">
            {zxingReady ? '✅' : '❌'} ZXing Library: {zxingReady ? 'Ready' : 'Not Ready'}
          </div>
        </div>

        {/* Debug Controls */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <button
            onClick={testZXingDirectly}
            className="flex items-center justify-center px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            🧪 Test ZXing
          </button>
          <button
            onClick={isScanning ? stopScanning : startScanning}
            className={`flex items-center justify-center px-4 py-2 rounded ${
              isScanning 
                ? 'bg-red-500 hover:bg-red-600 text-white' 
                : 'bg-green-500 hover:bg-green-600 text-white'
            }`}
          >
            <Camera className="mr-2" size={20} />
            {isScanning ? 'Stop' : 'Start'} Scan
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

        {/* Video and Canvas Display */}
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
            <h3 className="font-semibold mb-2">🖼️ Debug Canvas</h3>
            <canvas
              ref={debugCanvasRef}
              className="w-full h-40 bg-gray-100 border rounded"
            />
          </div>
        </div>

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
