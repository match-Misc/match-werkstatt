import { useState } from 'react';
import { Download, Eye, FileText, Box } from 'lucide-react';
import STLViewer from './STLViewer';

interface DocumentFile {
  name: string;
  url: string;
  uploadDate: string;
}

interface DocumentViewerProps {
  document: DocumentFile;
  onDownload?: (document: DocumentFile) => void;
  showPreview?: boolean;
  className?: string;
}

const DocumentViewer = ({ 
  document, 
  onDownload, 
  showPreview = true,
  className = '' 
}: DocumentViewerProps) => {
  const [showSTLViewer, setShowSTLViewer] = useState(false);
  
  // Check if file is a 3D file that we can view
  const is3DFile = /\.(stl|obj|ply|3ds|dae|gltf|glb)$/i.test(document.name);
  
  // Check if file is viewable in our 3D viewer (currently only STL)
  const isViewable3DFile = /\.stl$/i.test(document.name);
  
  // Get file extension for icon
  const getFileIcon = () => {
    if (is3DFile) return <Box className="w-4 h-4" />;
    return <FileText className="w-4 h-4" />;
  };
  
  // Get file type description
  const getFileTypeDescription = () => {
    const ext = document.name.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'stl': return '3D-Modell (STL)';
      case 'obj': return '3D-Modell (OBJ)';
      case 'ply': return '3D-Modell (PLY)';
      case 'pdf': return 'PDF-Dokument';
      case 'dwg': return 'CAD-Zeichnung (DWG)';
      case 'dxf': return 'CAD-Zeichnung (DXF)';
      case 'step':
      case 'stp': return 'CAD-Modell (STEP)';
      case 'iges':
      case 'igs': return 'CAD-Modell (IGES)';
      default: return 'Dokument';
    }
  };
  
  const handleDownload = () => {
    if (onDownload) {
      onDownload(document);
    }
  };
  
  const toggleSTLViewer = () => {
    setShowSTLViewer(!showSTLViewer);
  };
  
  return (
    <div className={`bg-white border border-gray-200 rounded-lg overflow-hidden ${className}`}>
      {/* Document Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3 flex-1 min-w-0">
            <div className={`p-2 rounded-lg ${is3DFile ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'}`}>
              {getFileIcon()}
            </div>
            
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-medium text-gray-900 truncate">
                {document.name}
              </h4>
              <div className="flex items-center space-x-2 mt-1">
                <span className="text-xs text-gray-500">
                  {getFileTypeDescription()}
                </span>
                <span className="text-xs text-gray-400">•</span>
                <span className="text-xs text-gray-500">
                  {new Date(document.uploadDate).toLocaleDateString('de-DE')}
                </span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center space-x-2 ml-4">
            {/* 3D View Button for STL files */}
            {isViewable3DFile && showPreview && (
              <button
                onClick={toggleSTLViewer}
                className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-purple-600 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-md transition-colors"
                title="3D-Ansicht"
              >
                <Eye className="w-3 h-3 mr-1" />
                {showSTLViewer ? '3D ausblenden' : '3D anzeigen'}
              </button>
            )}
            
            {/* Download Button */}
            <button
              onClick={handleDownload}
              className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md transition-colors"
              title="Herunterladen"
            >
              <Download className="w-3 h-3 mr-1" />
              Download
            </button>
          </div>
        </div>
      </div>
      
      {/* STL Viewer */}
      {isViewable3DFile && showSTLViewer && showPreview && (
        <div className="p-4 bg-gray-50">
          <STLViewer
            fileUrl={`${document.url}`}
            fileName={document.name}
            className="w-full"
            showControls={true}
          />
        </div>
      )}
      
      {/* Additional Info for 3D Files */}
      {is3DFile && (
        <div className={`px-4 py-2 border-t ${isViewable3DFile ? 'bg-purple-50 border-purple-100' : 'bg-yellow-50 border-yellow-200'}`}>
          <div className={`flex items-center text-xs ${isViewable3DFile ? 'text-purple-700' : 'text-yellow-700'}`}>
            <Box className="w-3 h-3 mr-1" />
            <span>
              {isViewable3DFile 
                ? '3D-Modell kann in der Vorschau angezeigt werden' 
                : '3D-Datei (Vorschau nicht verfügbar)'
              }
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentViewer;
