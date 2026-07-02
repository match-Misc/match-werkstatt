import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { networkUploadUtils } from '../../utils/networkUpload';

describe('networkUploadUtils', () => {
  
  describe('getFileCategory', () => {
    it('sollte NC/GCODE Dateien korrekt als CAM identifizieren', () => {
      expect(networkUploadUtils.getFileCategory('part.nc')).toBe('CAM');
      expect(networkUploadUtils.getFileCategory('machine.gcode')).toBe('CAM');
      expect(networkUploadUtils.getFileCategory('script.iso')).toBe('CAM');
    });

    it('sollte Konstruktionsdateien als Zeichnung identifizieren', () => {
      expect(networkUploadUtils.getFileCategory('plan.dwg')).toBe('Zeichnung');
      expect(networkUploadUtils.getFileCategory('model.step')).toBe('Zeichnung');
      expect(networkUploadUtils.getFileCategory('doc.pdf')).toBe('Zeichnung');
    });

    it('sollte Bilddateien als Foto identifizieren', () => {
      expect(networkUploadUtils.getFileCategory('image.jpg')).toBe('Foto');
      expect(networkUploadUtils.getFileCategory('screenshot.png')).toBe('Foto');
    });

    it('sollte unbekannte Dateitypen auf Dokument zurückfallen lassen', () => {
      expect(networkUploadUtils.getFileCategory('notes.txt')).toBe('Dokument');
      expect(networkUploadUtils.getFileCategory('data.csv')).toBe('Dokument');
    });
  });

  describe('autoUpload', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      // Mocke die internen Upload-Aufrufe, damit keine echten API-Requests abgefeuert werden
      vi.spyOn(networkUploadUtils, 'uploadComponentDocument').mockResolvedValue({} as any);
      vi.spyOn(networkUploadUtils, 'uploadCAMFile').mockResolvedValue({} as any);
      vi.spyOn(networkUploadUtils, 'uploadOrderDocument').mockResolvedValue({} as any);
    });

    it('sollte in Bauteil hochladen, wenn Bauteil-ID existiert und es keine CAM Datei ist', async () => {
      const file = { name: 'drawing.pdf' } as unknown as File;
      await networkUploadUtils.autoUpload('order-1', 'comp-1', file);
      expect(networkUploadUtils.uploadComponentDocument).toHaveBeenCalledWith('comp-1', file, undefined);
    });

    it('sollte CAM-Dateien IMMER auf Auftragsebene hochladen, auch wenn eine Bauteil-ID mitgegeben wird', async () => {
      const file = { name: 'code.nc' } as unknown as File;
      await networkUploadUtils.autoUpload('order-1', 'comp-1', file);
      expect(networkUploadUtils.uploadCAMFile).toHaveBeenCalledWith('order-1', file);
      expect(networkUploadUtils.uploadComponentDocument).not.toHaveBeenCalled();
    });

    it('sollte ein Standard-Auftragsdokument hochladen, wenn keine Bauteil-ID existiert', async () => {
      const file = { name: 'doc.pdf' } as unknown as File;
      await networkUploadUtils.autoUpload('order-1', null, file);
      expect(networkUploadUtils.uploadOrderDocument).toHaveBeenCalledWith('order-1', file, undefined);
    });
  });

  describe('API Upload Methods', () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
      vi.restoreAllMocks(); // Wichtig: Entfernt die spies aus dem autoUpload describe!
      global.fetch = vi.fn();
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('sollte uploadOrderDocument erfolgreich ausführen', async () => {
      const mockResponse = { success: true, message: 'Upload OK' };
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const file = new File(['dummy'], 'test.pdf');
      const result = await networkUploadUtils.uploadOrderDocument('order-123', file, 'Warning');
      
      expect(global.fetch).toHaveBeenCalledWith('/api/orders/order-123/upload-document', expect.objectContaining({
        method: 'POST',
      }));
      expect(result).toEqual(mockResponse);
    });

    it('sollte Fehler bei uploadOrderDocument werfen, wenn Response nicht ok ist', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Serverfehler 500' }),
      });

      const file = new File(['dummy'], 'test.pdf');
      await expect(networkUploadUtils.uploadOrderDocument('order-123', file)).rejects.toThrow('Serverfehler 500');
    });

    it('sollte den Catch-Block bei Netzwerkfehlern abdecken', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));
      const file = new File(['dummy'], 'test.nc');
      
      await expect(networkUploadUtils.uploadCAMFile('order-123', file)).rejects.toThrow('Network error');
    });
  });
});
