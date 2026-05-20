import { useState, useRef, DragEvent, ChangeEvent } from 'react';
import { Upload, FileText, AlertCircle, CheckCircle, Loader } from 'lucide-react';

interface DroppedFile {
  file: File;
  id: string;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
  progress?: number;
}

interface NetworkDragDropUploadProps {
  orderId: string;
  uploadType: 'cam' | 'document';
  targetFolder?: string; // Optional subfolder like 'CAM-Dateien'
  onUploadSuccess?: (fileName: string) => void;
  onUploadError?: (error: string) => void;
  acceptedTypes?: string[];
}

export default function NetworkDragDropUpload({
  orderId,
  uploadType,
  targetFolder = '',
  onUploadSuccess,
  onUploadError,
  acceptedTypes
}: NetworkDragDropUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [files, setFiles] = useState<DroppedFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const droppedFiles = Array.from(e.dataTransfer.files);
    handleFiles(droppedFiles);
  };

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      handleFiles(selectedFiles);
    }
  };

  const handleFiles = (fileList: File[]) => {
    const newFiles: DroppedFile[] = fileList.map(file => ({
      file,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      status: 'pending'
    }));

    setFiles(prev => [...prev, ...newFiles]);
    
    // Start upload for each file
    newFiles.forEach(droppedFile => {
      uploadFile(droppedFile);
    });
  };

  const uploadFile = async (droppedFile: DroppedFile) => {
    // Update file status to uploading
    setFiles(prev => prev.map(f => 
      f.id === droppedFile.id 
        ? { ...f, status: 'uploading', progress: 0 }
        : f
    ));

    try {
      const formData = new FormData();
      formData.append('file', droppedFile.file);
      
      // Add target folder if specified
      if (targetFolder) {
        formData.append('targetFolder', targetFolder);
      }

      // Determine upload endpoint based on type
      const endpoint = uploadType === 'cam' 
        ? `/api/orders/${orderId}/upload-cam-file`
        : `/api/orders/${orderId}/upload-document`;

      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Upload failed: ${errorData}`);
      }

      await response.json(); // Parse response but don't store

      // Update file status to success
      setFiles(prev => prev.map(f => 
        f.id === droppedFile.id 
          ? { ...f, status: 'success', progress: 100 }
          : f
      ));

      if (onUploadSuccess) {
        onUploadSuccess(droppedFile.file.name);
      }

    } catch (error) {
      console.error('Upload error:', error);
      
      // Update file status to error
      setFiles(prev => prev.map(f => 
        f.id === droppedFile.id 
          ? { ...f, status: 'error', error: error instanceof Error ? error.message : 'Upload failed' }
          : f
      ));

      if (onUploadError) {
        onUploadError(error instanceof Error ? error.message : 'Upload failed');
      }
    }
  };

  const clearFiles = () => {
    setFiles([]);
  };

  const removeFile = (fileId: string) => {
    setFiles(prev => prev.filter(f => f.id !== fileId));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (fileName: string) => {
    const extension = fileName.split('.').pop()?.toLowerCase();
    
    if (['nc', 'gcode', 'tap'].includes(extension || '')) {
      return <FileText className="w-6 h-6 text-green-500" />;
    }
    
    return <FileText className="w-6 h-6 text-blue-500" />;
  };

  const getStatusIcon = (status: DroppedFile['status']) => {
    switch (status) {
      case 'uploading':
        return <Loader className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      {/* Drag and Drop Zone */}
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
          isDragOver
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 hover:border-gray-400'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="flex flex-col items-center space-y-2">
          <div className="flex items-center space-x-2">
            <Upload className="w-8 h-8 text-gray-400" />
            <span className="text-xl">📁↑</span>
          </div>
          
          <div className="space-y-1">
            <p className="text-lg font-medium text-gray-700">
              {uploadType === 'cam' ? 'Interne Daten hochladen' : 'Datei hochladen'}
            </p>
            <p className="text-sm text-gray-500">
              → Uploads/00_Interne Dokumente{targetFolder ? `/${targetFolder}` : ''}
            </p>
          </div>
          
          <p className="text-sm text-gray-600">
            Datei hier ablegen oder klicken zum Auswählen
          </p>
          
          <p className="text-xs text-gray-500">
            {acceptedTypes 
              ? `Unterstützte Dateitypen: ${acceptedTypes.join(', ')}` 
              : 'Alle Dateitypen werden akzeptiert'
            }
          </p>
        </div>
        
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={acceptedTypes ? acceptedTypes.join(',') : '*/*'}
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {/* File List */}
      {files.length > 0 && (
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <h4 className="text-sm font-medium text-gray-700">
              Hochgeladene Dateien ({files.length})
            </h4>
            <button
              onClick={clearFiles}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Alle entfernen
            </button>
          </div>
          
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {files.map((droppedFile) => (
              <div
                key={droppedFile.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-md border"
              >
                <div className="flex items-center space-x-3 flex-1 min-w-0">
                  {getFileIcon(droppedFile.file.name)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {droppedFile.file.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatFileSize(droppedFile.file.size)}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  {getStatusIcon(droppedFile.status)}
                  
                  {droppedFile.status === 'uploading' && droppedFile.progress !== undefined && (
                    <div className="w-20 bg-gray-200 rounded-full h-1.5">
                      <div
                        className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                        style={{ width: `${droppedFile.progress}%` }}
                      />
                    </div>
                  )}
                  
                  {droppedFile.status === 'error' && droppedFile.error && (
                    <p className="text-xs text-red-600 max-w-32 truncate" title={droppedFile.error}>
                      {droppedFile.error}
                    </p>
                  )}
                  
                  {droppedFile.status !== 'uploading' && (
                    <button
                      onClick={() => removeFile(droppedFile.id)}
                      className="text-xs text-gray-400 hover:text-gray-600"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
