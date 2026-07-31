import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { checkPdfSize } from '../../utils/pdfChecker';

// Hilfsfunktion, um im Speicher ein PDF mit spezifischen Dimensionen zu erzeugen
async function createMockPdfFile(width: number, height: number): Promise<File> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.addPage([width, height]);
  const pdfBytes = await pdfDoc.save();
  return new File([pdfBytes.buffer as ArrayBuffer], 'test.pdf', { type: 'application/pdf' });
}

describe('checkPdfSize', () => {
  it('sollte null für Nicht-PDF Dateien zurückgeben', async () => {
    const file = new File(['dummy content'], 'test.txt', { type: 'text/plain' });
    const result = await checkPdfSize(file);
    expect(result).toBeNull();
  });

  it('sollte null für A4 PDFs (max ~842 pt) zurückgeben', async () => {
    const file = await createMockPdfFile(595, 842);
    const result = await checkPdfSize(file);
    expect(result).toBeNull();
  });

  it('sollte null für A3 PDFs (max ~1191 pt) zurückgeben', async () => {
    const file = await createMockPdfFile(842, 1191);
    const result = await checkPdfSize(file);
    expect(result).toBeNull();
  });

  it('sollte "A2" für A2 PDFs (max ~1684 pt) zurückgeben', async () => {
    const file = await createMockPdfFile(1191, 1684);
    const result = await checkPdfSize(file);
    expect(result).toBe('A2');
  });

  it('sollte "A1" für A1 PDFs (max ~2384 pt) zurückgeben', async () => {
    const file = await createMockPdfFile(1684, 2384);
    const result = await checkPdfSize(file);
    expect(result).toBe('A1');
  });

  it('sollte "A0 oder größer" für A0 PDFs (max ~3370 pt) zurückgeben', async () => {
    const file = await createMockPdfFile(2384, 3370);
    const result = await checkPdfSize(file);
    expect(result).toBe('A0 oder größer');
  });
});
