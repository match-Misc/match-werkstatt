// Network Upload Utilities
export const networkUploadUtils = {
  /**
   * Upload file to network folder
   */
  async uploadToNetworkFolder(file, orderId, componentId = null, uploadType = 'auto') {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('orderId', orderId);
    if (componentId) {
      formData.append('componentId', componentId);
    }
    formData.append('uploadType', uploadType);

    try {
      const response = await fetch('/api/upload/network', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Network upload error:', error);
      throw error;
    }
  },

  /**
   * Check if network folder exists for order
   */
  async checkNetworkFolder(orderId) {
    try {
      const response = await fetch(`/api/orders/${orderId}/network-folder-status`);
      if (!response.ok) {
        throw new Error(`Check failed: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Network folder check error:', error);
      throw error;
    }
  },

  /**
   * Get supported file types based on upload type
   */
  getSupportedFileTypes(uploadType) {
    const fileTypes = {
      'auto': '.pdf,.stl,.step,.stp,.dwg,.dxf,.jpg,.jpeg,.png,.gif,.txt,.doc,.docx',
      'document': '.pdf,.txt,.doc,.docx,.jpg,.jpeg,.png,.gif',
      'cam': '.step,.stp,.stl,.dwg,.dxf',
      'component': '.pdf,.stl,.step,.stp,.jpg,.jpeg,.png,.gif'
    };
    
    return fileTypes[uploadType] || fileTypes['auto'];
  },

  /**
   * Validate file before upload
   */
  validateFile(file, uploadType = 'auto') {
    const maxSize = 50 * 1024 * 1024; // 50MB
    const supportedTypes = this.getSupportedFileTypes(uploadType);
    
    // Check file size
    if (file.size > maxSize) {
      throw new Error('Datei ist zu groß (max. 50MB)');
    }

    // Check file type
    const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
    if (!supportedTypes.includes(fileExtension)) {
      throw new Error(`Dateityp nicht unterstützt. Erlaubt: ${supportedTypes}`);
    }

    return true;
  },

  /**
   * Format file size for display
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
};