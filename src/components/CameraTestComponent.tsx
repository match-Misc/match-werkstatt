// Standalone Kamera-Test für die React-Anwendung
import { useState } from 'react';

export default function CameraTestComponent() {
  const [status, setStatus] = useState('Bereit zum Testen');
  const [stream, setStream] = useState<MediaStream | null>(null);

  const testCamera = async () => {
    try {
      setStatus('🎥 Fordere Kamera-Berechtigung an...');
      console.log('🎥 Requesting camera permission...');
      
      // Explizit nach Kamera-Berechtigung fragen
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: { ideal: 'environment' },
          width: { ideal: 640 },
          height: { ideal: 480 }
        } 
      });
      
      console.log('✅ Camera permission granted');
      setStream(mediaStream);
      setStatus('✅ Kamera erfolgreich aktiviert!');
      
      // Nach 5 Sekunden automatisch stoppen
      setTimeout(() => {
        stopCamera();
      }, 5000);
      
    } catch (error) {
      console.error('❌ Camera test failed:', error);
      setStatus(`❌ Fehler: ${error instanceof Error ? error.message : String(error)}`);
      
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          setStatus('🚫 Kamera-Zugriff verweigert. Prüfen Sie die Browser-Einstellungen.');
        }
      }
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
      setStatus('⏹️ Kamera gestoppt');
      console.log('📷 Camera stopped');
    }
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow-lg max-w-md mx-auto">
      <h3 className="text-lg font-semibold mb-4">🧪 Kamera-Test</h3>
      <p className="text-sm text-gray-600 mb-4">
        Dieser Test prüft, ob Ihr Browser Kamera-Zugriff erlaubt.
      </p>
      
      <div className="mb-4 p-3 bg-gray-100 rounded text-sm">
        Status: {status}
      </div>
      
      {stream && (
        <video 
          ref={(video) => {
            if (video && stream) {
              video.srcObject = stream;
              video.play();
            }
          }}
          className="w-full h-48 bg-black rounded mb-4"
          muted
          autoPlay
          playsInline
        />
      )}
      
      <div className="space-y-2">
        <button
          onClick={testCamera}
          disabled={!!stream}
          className="w-full bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:bg-gray-400"
        >
          📷 Kamera testen
        </button>
        
        {stream && (
          <button
            onClick={stopCamera}
            className="w-full bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
          >
            ⏹️ Stoppen
          </button>
        )}
      </div>
      
      <div className="mt-4 text-xs text-gray-500">
        💡 Tipp: Öffnen Sie die Browser-Konsole (F12) für detaillierte Logs
      </div>
    </div>
  );
}
