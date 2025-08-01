import { useState, useEffect } from 'react';
import { ExternalLink, Download, AlertCircle, Eye, Settings } from 'lucide-react';
import { stepViewerServices, stepViewerUtils } from '../utils/stepViewerServices';

interface StepViewerProps {
  fileUrl: string;
  fileName: string;
  className?: string;
  showControls?: boolean;
}

export default function StepViewer({ 
  fileUrl, 
  fileName, 
  className = '', 
  showControls = true 
}: StepViewerProps) {
  const [selectedViewer, setSelectedViewer] = useState(stepViewerServices[0]);
  const [isFileAccessible, setIsFileAccessible] = useState<boolean | null>(null);
  const [showViewerOptions, setShowViewerOptions] = useState(false);
  const [viewMode, setViewMode] = useState<'placeholder' | 'online' | 'download'>('placeholder');

  useEffect(() => {
    // Check if file is publicly accessible for online viewers
    stepViewerUtils.isFilePubliclyAccessible(fileUrl)
      .then(accessible => {
        setIsFileAccessible(accessible);
        if (accessible) {
          setViewMode('online');
        }
      });
  }, [fileUrl]);

  const handleViewerChange = (viewerIndex: number) => {
    setSelectedViewer(stepViewerServices[viewerIndex]);
    setShowViewerOptions(false);
  };

  const renderPlaceholder = () => (
    <div className="bg-gradient-to-br from-blue-50 to-purple-50 p-8 rounded-lg text-center">
      <div className="w-24 h-24 mx-auto mb-4 bg-blue-100 rounded-full flex items-center justify-center">
        <svg className="w-12 h-12 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      </div>
      
      <h3 className="text-xl font-bold text-gray-800 mb-2">
        STEP/STP CAD-Modell
      </h3>
      
      <p className="text-sm text-gray-600 mb-6">
        {fileName}
      </p>
      
      <div className="space-y-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center text-yellow-800">
            <AlertCircle className="w-5 h-5 mr-2" />
            <span className="text-sm font-medium">
              STEP-Dateien benötigen spezielle Viewer-Software
            </span>
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => setViewMode('online')}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center"
          >
            <Eye className="w-4 h-4 mr-2" />
            Online Viewer öffnen
          </button>
          
          <a
            href={fileUrl}
            download={fileName}
            className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center"
          >
            <Download className="w-4 h-4 mr-2" />
            Datei herunterladen
          </a>
        </div>
        
        <div className="text-xs text-gray-500 space-y-1">
          <p>💡 <strong>Empfohlene Software:</strong> FreeCAD, SolidWorks, Fusion 360, Inventor</p>
          <p>🌐 <strong>Online-Alternative:</strong> Verwenden Sie den integrierten Online-Viewer</p>
        </div>
      </div>
    </div>
  );

  const renderOnlineViewer = () => (
    <div className="space-y-4">
      {/* Viewer Selection */}
      {showControls && (
        <div className="bg-gray-50 p-4 rounded-lg">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-medium text-gray-800">Online STEP Viewer</h4>
            <button
              onClick={() => setShowViewerOptions(!showViewerOptions)}
              className="text-gray-600 hover:text-gray-800 flex items-center text-sm"
            >
              <Settings className="w-4 h-4 mr-1" />
              Viewer wählen
            </button>
          </div>
          
          {showViewerOptions && (
            <div className="space-y-2">
              {stepViewerServices.map((service, index) => (
                <button
                  key={service.name}
                  onClick={() => handleViewerChange(index)}
                  className={`w-full text-left p-3 rounded border transition-colors ${
                    selectedViewer.name === service.name
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="font-medium text-sm">{service.name}</div>
                  <div className="text-xs text-gray-600 mt-1">
                    {service.features.slice(0, 2).join(', ')}
                  </div>
                </button>
              ))}
            </div>
          )}
          
          <div className="mt-3 text-xs text-gray-600">
            <strong>Aktuell:</strong> {selectedViewer.name}
            <br />
            <strong>Features:</strong> {selectedViewer.features.join(', ')}
          </div>
        </div>
      )}
      
      {/* File Accessibility Check */}
      {isFileAccessible === false && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center text-red-800">
            <AlertCircle className="w-5 h-5 mr-2" />
            <div>
              <div className="font-medium">Datei nicht öffentlich zugänglich</div>
              <div className="text-sm mt-1">
                Die Datei muss öffentlich erreichbar sein für Online-Viewer. 
                Verwenden Sie stattdessen den Download.
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Online Viewer Iframe */}
      {isFileAccessible && (
        <div className="bg-white rounded-lg border overflow-hidden">
          <div className="bg-gray-100 px-4 py-2 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">
              {selectedViewer.name} - {fileName}
            </span>
            <a
              href={selectedViewer.embedUrl(fileUrl)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 flex items-center text-sm"
            >
              <ExternalLink className="w-4 h-4 mr-1" />
              Vollbild
            </a>
          </div>
          
          <iframe
            src={selectedViewer.embedUrl(fileUrl)}
            className="w-full h-96"
            frameBorder="0"
            allowFullScreen
            title={`STEP Viewer - ${fileName}`}
          />
        </div>
      )}
      
      {/* Fallback Options */}
      <div className="flex gap-3 justify-center">
        <button
          onClick={() => setViewMode('placeholder')}
          className="text-gray-600 hover:text-gray-800 text-sm flex items-center"
        >
          ← Zurück zu Placeholder
        </button>
        
        <a
          href={fileUrl}
          download={fileName}
          className="text-green-600 hover:text-green-800 text-sm flex items-center"
        >
          <Download className="w-4 h-4 mr-1" />
          Original herunterladen
        </a>
      </div>
    </div>
  );

  return (
    <div className={`bg-white rounded-lg ${className}`}>
      {viewMode === 'placeholder' && renderPlaceholder()}
      {viewMode === 'online' && renderOnlineViewer()}
    </div>
  );
}
