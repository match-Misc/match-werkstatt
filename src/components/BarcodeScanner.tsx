import React, { useState, useRef, useEffect } from 'react';
import { BrowserMultiFormatReader } from '@zxing/library';
import { X, Camera, Search } from 'lucide-react';

interface QRCodeScannerProps {
  onScan: (code: string) => void;
  onClose: () => void;
}

export default function QRCodeScanner({ onScan, onClose }: QRCodeScannerProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const codeReader = useRef<BrowserMultiFormatReader | null>(null);

  useEffect(() => {
    codeReader.current = new BrowserMultiFormatReader();
    
    return () => {
      stopScanning();
    };
  }, []);

  const startScanning = async () => {
    if (!codeReader.current || !videoRef.current) return;
    
    try {
      setError(null);
      setIsScanning(true);
      
      const devices = await codeReader.current.listVideoInputDevices();
      if (devices.length === 0) {
        throw new Error('Keine Kamera gefunden');
      }

      // Bevorzuge die Rückkamera falls verfügbar
      const backCamera = devices.find(device => 
        device.label.toLowerCase().includes('back') || 
        device.label.toLowerCase().includes('rear')
      ) || devices[0];

      await codeReader.current.decodeFromVideoDevice(
        backCamera.deviceId,
        videoRef.current,
        (result, error) => {
          if (result) {
            const scannedText = result.getText();
            console.log('QR-Code gescannt:', scannedText);
            
            // Wenn es eine URL ist, extrahiere die Auftragsnummer/ID
            let orderCode = scannedText;
            if (scannedText.includes('/order/')) {
              orderCode = scannedText.split('/order/').pop() || scannedText;
            }
            
            onScan(orderCode);
            stopScanning();
          }
          if (error && error.name !== 'NotFoundException') {
            console.error('Scanner-Fehler:', error);
            setError('Fehler beim Scannen');
          }
        }
      );
    } catch (err) {
      console.error('Fehler beim Starten des Scanners:', err);
      setError('Fehler beim Zugriff auf die Kamera');
      setIsScanning(false);
    }
  };

  const stopScanning = () => {
    if (codeReader.current) {
      codeReader.current.reset();
    }
    setIsScanning(false);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualCode.trim()) {
      onScan(manualCode.trim());
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full m-4">
        <div className="flex justify-between items-center p-4 border-b">
          <h3 className="text-lg font-semibold">QR-Code Scanner</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-4">
          {/* Kamera-Scanner */}
          <div className="mb-6">
            <h4 className="font-medium mb-3">Kamera scannen</h4>
            
            {!isScanning ? (
              <button
                onClick={startScanning}
                className="w-full bg-blue-600 text-white px-4 py-3 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center"
              >
                <Camera className="w-5 h-5 mr-2" />
                Scanner starten
              </button>
            ) : (
              <div className="space-y-3">
                <div className="relative bg-black rounded-lg overflow-hidden">
                  <video
                    ref={videoRef}
                    className="w-full h-48 object-cover"
                    style={{ transform: 'scaleX(-1)' }} // Spiegeln für bessere UX
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="border-2 border-red-500 w-48 h-32 rounded"></div>
                  </div>
                </div>
                
                <button
                  onClick={stopScanning}
                  className="w-full bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
                >
                  Scanner stoppen
                </button>
              </div>
            )}

            {error && (
              <div className="mt-3 p-3 bg-red-100 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}
          </div>

          {/* Manuelle Eingabe */}
          <div className="border-t pt-4">
            <h4 className="font-medium mb-3">Manuell eingeben</h4>
            <form onSubmit={handleManualSubmit} className="space-y-3">
              <input
                type="text"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="Auftragsnummer oder QR-Code eingeben"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                disabled={!manualCode.trim()}
                className="w-full bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400 transition-colors flex items-center justify-center"
              >
                <Search className="w-4 h-4 mr-2" />
                Suchen
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
