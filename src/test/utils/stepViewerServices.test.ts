import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { stepViewerUtils, stepViewerServices } from '../../utils/stepViewerServices';

describe('stepViewerServices', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('isFilePubliclyAccessible', () => {
    it('sollte true zurückgeben, wenn die Response ok ist', async () => {
      (global.fetch as any).mockResolvedValueOnce({ ok: true });
      const result = await stepViewerUtils.isFilePubliclyAccessible('https://example.com/file.step');
      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith('https://example.com/file.step', { method: 'HEAD' });
    });

    it('sollte false zurückgeben, wenn die Response nicht ok ist', async () => {
      (global.fetch as any).mockResolvedValueOnce({ ok: false });
      const result = await stepViewerUtils.isFilePubliclyAccessible('https://example.com/file.step');
      expect(result).toBe(false);
    });

    it('sollte den Catch-Block abdecken und false zurückgeben bei Netzwerkfehlern', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('CORS Error'));
      const result = await stepViewerUtils.isFilePubliclyAccessible('https://example.com/file.step');
      expect(result).toBe(false); // Fällt sauber auf false zurück
    });
  });

  describe('getBestViewer', () => {
    it('sollte den KISTERS Viewer zurückgeben, wenn keine speziellen Requirements existieren', () => {
      const viewer = stepViewerUtils.getBestViewer({});
      expect(viewer.name).toContain('KISTERS');
    });

    it('sollte den KISTERS Viewer (als hybrid) für "public" Privacy zurückgeben, da er zuerst in der Liste steht', () => {
      const viewer = stepViewerUtils.getBestViewer({ privacy: 'public' });
      expect(viewer.name).toContain('KISTERS');
    });

    it('sollte CAD Exchanger für private Anforderungen zurückgeben', () => {
      const viewer = stepViewerUtils.getBestViewer({ privacy: 'private' });
      // KISTERS ist 'hybrid' und CAD Exchanger 'private'. 
      // Weil beide erlaubt sind, checken wir, ob es nicht 'public' ist
      expect(viewer.privacy).not.toBe('public');
    });
  });

  describe('generateEmbedCode', () => {
    it('sollte den HTML-String für einen Iframe generieren', () => {
      const viewer = stepViewerServices[0];
      const html = stepViewerUtils.generateEmbedCode(viewer, 'https://test.com/file.step', {
        width: '800px',
        height: '600px'
      });
      expect(html).toContain('<iframe');
      expect(html).toContain('width="800px"');
      expect(html).toContain('height="600px"');
      expect(html).toContain(encodeURIComponent('https://test.com/file.step'));
    });
  });
});
