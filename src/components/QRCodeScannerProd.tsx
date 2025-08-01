import { useState, useRef, useEffect } from 'react';
import { X, Camera, AlertCircle, Search } from 'lucide-react';
import jsQR from 'jsqr';

interface QRCodeScannerProdProps {
  onScan: (code: string) => void;
  onClose: () => void;
}

export default function QRCodeScannerProd({ onScan, onClose }: QRCodeScannerProdProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [scanStatus, setScanStatus] = useState<string>('Bereit zum Scannen');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isScanningRef = useRef(false);

  useEffect(() => {
    return () => {
      stopScanning();
    };
  }, []);

  const startScanning = async () => {
    if (!videoRef.current || !canvasRef.current) {
      setError('Scanner-Elemente nicht verfügbar');
      return;
    }
    
    try {
      setError(null);
      setScanStatus('Kamera wird gestartet...');
      setIsScanning(true);
      isScanningRef.current = true;
      
      // Request camera permission with environment facing camera (back camera)
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: { ideal: 'environment' },
          width: { ideal: 640 },
          height: { ideal: 480 }
        } 
      });
      
      const video = videoRef.current;
      video.srcObject = stream;
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true;
      
      // Wait for video to be ready
      await new Promise<void>((resolve) => {
        const checkReady = () => {
          if (video.readyState >= 2 && video.videoWidth > 0) {
            setScanStatus('Kamera bereit - QR-Code vor die Kamera halten');
            resolve();
          } else {
            setTimeout(checkReady, 100);
          }
        };
        checkReady();
      });
      
      await video.play();
      startQRDetection();
      
    } catch (err) {
      console.error('Camera error:', err);
      setError(`Kamera-Fehler: ${err instanceof Error ? err.message : 'Unbekannter Fehler'}`);
      setIsScanning(false);
      isScanningRef.current = false;
    }
  };

  const startQRDetection = () => {
    if (!videoRef.current || !canvasRef.current) {
      return;
    }
    
    setScanStatus('🔍 Scanning aktiv - QR-Code vor die Kamera halten');
    isScanningRef.current = true;
    
    const detectQRCode = () => {
      // Check if we should continue scanning
      if (!isScanningRef.current) {
        return;
      }
      
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      if (!video || !canvas || video.readyState < 2 || video.videoWidth === 0) {
        animationFrameRef.current = requestAnimationFrame(detectQRCode);
        return;
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
        }
        
        // Capture frame
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Get image data for jsQR
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        // Try to detect QR code
        const qrCode = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: "attemptBoth",
        });
        
        if (qrCode) {
          const text = qrCode.data;
          console.log('QR Code detected:', text);
          
          // Stop scanning
          isScanningRef.current = false;
          setIsScanning(false);
          setScanStatus('✅ QR-Code erkannt!');
          
          if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
          }
          
          // Extract order number if it's a URL
          let codeToSend = text;
          if (text.includes('/order/')) {
            const orderMatch = text.match(/\/order\/([^\/?\s#]+)/);
            if (orderMatch && orderMatch[1]) {
              codeToSend = orderMatch[1];
            }
          }
          
          // Call the callback
          onScan(codeToSend);
          return;
        }
        
        // Draw scanning overlay
        ctx.strokeStyle = '#10b981'; // green-500
        ctx.lineWidth = 3;
        
        // Draw scanning frame in center
        const frameSize = Math.min(canvas.width, canvas.height) * 0.6;
        const frameX = (canvas.width - frameSize) / 2;
        const frameY = (canvas.height - frameSize) / 2;
        
        ctx.strokeRect(frameX, frameY, frameSize, frameSize);
        
        // Draw corner markers
        const markerSize = 30;
        const corners = [
          [frameX, frameY], // top-left
          [frameX + frameSize - markerSize, frameY], // top-right
          [frameX, frameY + frameSize - markerSize], // bottom-left
          [frameX + frameSize - markerSize, frameY + frameSize - markerSize] // bottom-right
        ];
        
        corners.forEach(([x, y]) => {
          ctx.strokeRect(x, y, markerSize, markerSize);
        });
        
        // Add center crosshairs
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const crossSize = 15;
        
        ctx.beginPath();
        ctx.moveTo(centerX - crossSize, centerY);
        ctx.lineTo(centerX + crossSize, centerY);
        ctx.moveTo(centerX, centerY - crossSize);
        ctx.lineTo(centerX, centerY + crossSize);
        ctx.stroke();
        
        // Add instruction text
        ctx.fillStyle = '#10b981';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('QR-Code hier positionieren', centerX, frameY - 20);
        
      } catch (detectionError) {
        console.error('Detection error:', detectionError);
      }
      
      // Continue the detection loop
      animationFrameRef.current = requestAnimationFrame(detectQRCode);
    };
    
    // Start the detection loop
    animationFrameRef.current = requestAnimationFrame(detectQRCode);
  };

  const stopScanning = () => {
    isScanningRef.current = false;
    setIsScanning(false);
    setScanStatus('Scanner gestoppt');
    
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
  };

  const handleManualSubmit = () => {
    if (manualCode.trim()) {
      onScan(manualCode.trim());
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold flex items-center">
            <Camera className="mr-2" size={24} />
            QR-Code Scanner
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <X size={24} />
          </button>
        </div>

        {/* Status */}
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded">
          <div className="text-sm text-blue-700 text-center">
            {scanStatus}
          </div>
        </div>

        {/* Controls */}
        <div className="flex justify-center mb-4">
          <button
            onClick={isScanning ? stopScanning : startScanning}
            className={`flex items-center px-6 py-3 rounded-lg font-medium ${
              isScanning 
                ? 'bg-red-500 hover:bg-red-600 text-white' 
                : 'bg-green-500 hover:bg-green-600 text-white'
            }`}
          >
            <Camera className="mr-2" size={20} />
            {isScanning ? 'Scanner stoppen' : 'Scanner starten'}
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

        {/* Camera View */}
        <div className="mb-4">
          <div className="relative">
            <video
              ref={videoRef}
              className="w-full rounded-lg bg-gray-100"
              style={{ maxHeight: '300px' }}
              autoPlay
              playsInline
              muted
            />
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full rounded-lg"
              style={{ maxHeight: '300px' }}
            />
          </div>
        </div>

        {/* Manual Input */}
        <div className="border-t pt-4">
          <h3 className="font-medium mb-2 text-sm text-gray-600">
            Oder manuell eingeben:
          </h3>
          <div className="flex">
            <input
              type="text"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleManualSubmit()}
              placeholder="Auftrags-ID oder Code eingeben..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-l-md text-sm"
            />
            <button
              onClick={handleManualSubmit}
              disabled={!manualCode.trim()}
              className="px-4 py-2 bg-blue-500 text-white rounded-r-md hover:bg-blue-600 disabled:bg-gray-400"
            >
              <Search size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
