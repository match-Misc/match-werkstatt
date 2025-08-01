import { useState } from 'react';
import { networkUploadUtils } from '../utils/networkUpload';

interface NetworkFileUploadProps {
  orderId: string;
  componentId?: string | null;
  uploadType?: 'auto' | 'document' | 'cam' | 'component';
  onUploadSuccess?: (result: any) => void;
  onUploadError?: (error: Error) => void;
  className?: string;
}

const NetworkFileUpload = ({ 
  orderId, 
  componentId = null, 
  uploadType = 'auto',
  onUploadSuccess, 
  onUploadError,
  className = ''
}: NetworkFileUploadProps) => {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const handleFileUpload = async (file: File) => {
    if (!file) return;

    setUploading(true);
    try {
      let result;
      
      switch (uploadType) {
        case 'document':
          result = await networkUploadUtils.uploadOrderDocument(orderId, file);
          break;
        case 'cam':
          result = await networkUploadUtils.uploadCAMFile(orderId, file);
          break;
        case 'component':
          if (!componentId) {
            throw new Error('Component ID ist erforderlich für Bauteil-Upload');
          }
          result = await networkUploadUtils.uploadComponentDocument(componentId, file);
          break;
        case 'auto':
        default:
          result = await networkUploadUtils.autoUpload(orderId, componentId, file);
          break;
      }

      console.log('Upload erfolgreich:', result);
      
      if (onUploadSuccess) {
        onUploadSuccess(result);
      }
      
    } catch (error) {
      console.error('Upload-Fehler:', error);
      if (onUploadError) {
        onUploadError(error as Error);
      }
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const getUploadTypeLabel = () => {
    switch (uploadType) {
      case 'document': return 'Dokument';
      case 'cam': return 'CAM-Datei';
      case 'component': return 'Bauteil-Dokument';
      case 'auto': return 'Datei (automatische Erkennung)';
      default: return 'Datei';
    }
  };

  const getUploadDestination = () => {
    if (componentId && uploadType === 'component') {
      return `→ Netzwerkordner/Bauteile/[Bauteil-Name]`;
    } else if (uploadType === 'cam') {
      return `→ Netzwerkordner/CAM-Dateien`;
    } else {
      return `→ Netzwerkordner/Dokumentation`;
    }
  };

  return (
    <div className={`network-file-upload ${className}`}>
      <div
        className={`upload-zone ${dragOver ? 'drag-over' : ''} ${uploading ? 'uploading' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        style={{
          border: '2px dashed #ccc',
          borderRadius: '8px',
          padding: '20px',
          textAlign: 'center',
          backgroundColor: dragOver ? '#f0f8ff' : uploading ? '#f9f9f9' : '#fafafa',
          borderColor: dragOver ? '#007bff' : uploading ? '#28a745' : '#ccc',
          cursor: uploading ? 'not-allowed' : 'pointer',
          transition: 'all 0.3s ease',
          position: 'relative',
          minHeight: '120px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        {uploading ? (
          <div>
            <div className="spinner" style={{ marginBottom: '10px' }}>
              <div style={{
                border: '3px solid #f3f3f3',
                borderTop: '3px solid #007bff',
                borderRadius: '50%',
                width: '24px',
                height: '24px',
                animation: 'spin 1s linear infinite',
                margin: '0 auto'
              }}></div>
            </div>
            <p>Datei wird in Netzwerkordner hochgeladen...</p>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: '2em', marginBottom: '10px', color: '#007bff' }}>
              📁↑
            </div>
            <p style={{ marginBottom: '8px', fontWeight: 'bold' }}>
              {getUploadTypeLabel()} hochladen
            </p>
            <p style={{ fontSize: '0.9em', color: '#666', marginBottom: '10px' }}>
              {getUploadDestination()}
            </p>
            <p style={{ fontSize: '0.8em', color: '#888' }}>
              Datei hier ablegen oder klicken zum Auswählen
            </p>
            <input
              type="file"
              onChange={handleFileSelect}
              disabled={uploading}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                opacity: 0,
                cursor: uploading ? 'not-allowed' : 'pointer'
              }}
            />
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        .drag-over {
          background-color: #e3f2fd !important;
          border-color: #2196f3 !important;
        }
        
        .uploading {
          background-color: #f1f8e9 !important;
          border-color: #4caf50 !important;
        }
      `}</style>
    </div>
  );
};

export default NetworkFileUpload;
