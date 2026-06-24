import { useState, useEffect } from 'react';
import { Download, FileText, Image, File, RefreshCw, FolderOpen, AlertCircle, Archive, Wrench } from 'lucide-react';

interface NetworkFile {
  name: string;
  relativePath?: string;
  size: number;
  lastModified: string;
  created: string;
  extension: string;
  downloadUrl: string;
}

interface NetworkFilesResponse {
  success: boolean;
  message: string;
  files: NetworkFile[];
  folderPath: string;
  orderNumber: string;
}

interface NetworkFilesViewerProps {
  orderId: string;
  refreshTrigger?: number;
}

export default function NetworkFilesViewer({ orderId, refreshTrigger = 0 }: NetworkFilesViewerProps) {
  const [files, setFiles] = useState<NetworkFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [folderPath, setFolderPath] = useState<string>('');
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null);

  const loadNetworkFiles = async (silent = false) => {
    if (!silent) {
      setLoading(true);
    }
    setError(null);
    
    try {
      const response = await fetch(`/api/orders/${orderId}/network-files`);
      const data: NetworkFilesResponse = await response.json();
      
      if (data.success) {
        setFiles(data.files);
        setFolderPath(data.folderPath);
      } else {
        setError(data.message);
        setFiles([]);
      }
    } catch (err) {
      setError('Fehler beim Laden der Netzwerkdateien');
      setFiles([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNetworkFiles();
    
    const intervalId = setInterval(() => {
      loadNetworkFiles(true);
    }, 3000);
    
    return () => clearInterval(intervalId);
  }, [orderId, refreshTrigger]);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('de-DE');
  };

  const getFileIcon = (extension: string) => {
    const ext = extension.toLowerCase();
    
    if (['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg'].includes(ext)) {
      return <Image className="w-5 h-5 text-blue-500" />;
    }
    
    if (['.pdf', '.doc', '.docx', '.txt', '.rtf'].includes(ext)) {
      return <FileText className="w-5 h-5 text-red-500" />;
    }

    if (['.zip', '.rar', '.7z', '.tar', '.gz'].includes(ext)) {
      return <Archive className="w-5 h-5 text-yellow-600" />;
    }

    if (['.emcam'].includes(ext)) {
      return <Wrench className="w-5 h-5 text-teal-600" />;
    }
    
    return <File className="w-5 h-5 text-gray-500" />;
  };

  const handleDownload = async (file: NetworkFile) => {
    setDownloadingFile(file.name);
    
    try {
      // Use the network files download API endpoint with relative path
      const fileIdentifier = file.relativePath || file.name;
      const downloadUrl = `/api/orders/${orderId}/network-files/${encodeURIComponent(fileIdentifier)}/download`;
      const response = await fetch(downloadUrl);
      
      if (!response.ok) {
        throw new Error('Download fehlgeschlagen');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download error:', err);
      alert('Fehler beim Herunterladen der Datei');
    } finally {
      setDownloadingFile(null);
    }
  };

  if (loading) {
    return (
      <div className="">
        <div className="flex items-center space-x-2 mb-4">
          <FolderOpen className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-semibold">Interne Dokumente</h3>
          <RefreshCw className="w-4 h-4 animate-spin text-gray-400" />
        </div>
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-gray-500 mt-2">Lade Dateien...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <FolderOpen className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-semibold">Interne Dokumente</h3>
          <span className="text-sm text-gray-500">({files.length})</span>
        </div>
        <button
          onClick={() => loadNetworkFiles(false)}
          className="flex items-center space-x-1 px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Aktualisieren</span>
        </button>
      </div>

      {folderPath && (
        <div className="mb-4 p-3 bg-gray-50 rounded-md">
          <p className="text-sm text-gray-600">
            <strong>Ordnerpfad:</strong> {folderPath}
          </p>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-red-500" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      )}

      {files.length === 0 && !error ? (
        <div className="text-center py-8">
          <FolderOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Keine internen Dokumente gefunden</p>
          <p className="text-sm text-gray-400 mt-1">
            Dateien werden hier angezeigt, sobald sie hochgeladen werden
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {files.map((file, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-3 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center space-x-3 flex-1 min-w-0">
                {getFileIcon(file.extension)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate" title={(file.relativePath || file.name).replace(/uploads[/\\]?/gi, '')}>
                    {file.name}
                  </p>
                  <div className="flex items-center space-x-4 text-xs text-gray-500">
                    <span>{formatFileSize(file.size)}</span>
                    <span>Geändert: {formatDate(file.lastModified)}</span>
                    {file.relativePath && file.relativePath !== file.name && (
                      <span className="text-blue-600">📁 {file.relativePath.replace(/[^/\\]+$/, '').replace(/[/\\]$/, '')}</span>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={() => handleDownload(file)}
                disabled={downloadingFile === file.name}
                className="flex items-center space-x-1 px-3 py-1 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-md transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>{downloadingFile === file.name ? 'Lädt...' : 'Download'}</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
