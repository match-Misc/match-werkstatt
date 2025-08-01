// Network folder upload utilities

interface UploadResult {
  success: boolean;
  filename: string;
  originalname: string;
  path: string;
  networkPath: string;
  documentId?: string;
  componentName?: string;
  fileType?: string;
  message: string;
  warning?: string;
}

export const networkUploadUtils = {
  
  // Upload eines allgemeinen Auftragsdokuments
  async uploadOrderDocument(orderId: string, file: File): Promise<UploadResult> {
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const response = await fetch(`http://localhost:3001/api/orders/${orderId}/upload-document`, {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload fehlgeschlagen');
      }
      
      return await response.json() as UploadResult;
    } catch (error) {
      console.error('Error uploading order document:', error);
      throw error;
    }
  },
  
  // Upload einer CAM-Datei
  async uploadCAMFile(orderId: string, file: File): Promise<UploadResult> {
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const response = await fetch(`http://localhost:3001/api/orders/${orderId}/upload-cam-file`, {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'CAM-Upload fehlgeschlagen');
      }
      
      return await response.json() as UploadResult;
    } catch (error) {
      console.error('Error uploading CAM file:', error);
      throw error;
    }
  },
  
  // Upload eines Bauteil-spezifischen Dokuments
  async uploadComponentDocument(componentId: string, file: File): Promise<UploadResult> {
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const response = await fetch(`http://localhost:3001/api/components/${componentId}/upload-document`, {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Bauteil-Upload fehlgeschlagen');
      }
      
      return await response.json() as UploadResult;
    } catch (error) {
      console.error('Error uploading component document:', error);
      throw error;
    }
  },
  
  // Hilfsfunktion: Datei-Typ basierend auf Erweiterung bestimmen
  getFileCategory(filename: string): string {
    const extension = filename.toLowerCase().split('.').pop();
    
    const camExtensions = ['nc', 'gcode', 'cnc', 'tap', 'iso', 'mpf'];
    const drawingExtensions = ['dwg', 'dxf', 'pdf', 'step', 'stp', 'iges', 'igs'];
    const photoExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff'];
    
    if (camExtensions.includes(extension || '')) {
      return 'CAM';
    } else if (drawingExtensions.includes(extension || '')) {
      return 'Zeichnung';
    } else if (photoExtensions.includes(extension || '')) {
      return 'Foto';
    } else {
      return 'Dokument';
    }
  },
  
  // Automatischer Upload basierend auf Dateityp
  async autoUpload(orderId: string, componentId: string | null, file: File): Promise<UploadResult> {
    const category = this.getFileCategory(file.name);
    
    if (componentId && category !== 'CAM') {
      // Bauteil-spezifische Datei
      return await this.uploadComponentDocument(componentId, file);
    } else if (category === 'CAM') {
      // CAM-Datei (immer auf Auftragsebene)
      return await this.uploadCAMFile(orderId, file);
    } else {
      // Allgemeines Auftragsdokument
      return await this.uploadOrderDocument(orderId, file);
    }
  }
};
