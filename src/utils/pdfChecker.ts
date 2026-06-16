import { PDFDocument } from 'pdf-lib';

/**
 * Checks the size of a PDF file.
 * Returns a warning string if the PDF is larger than A3, otherwise returns null.
 * 
 * Dimensions in points (1 pt = 1/72 inch):
 * A4: max ~842
 * A3: max ~1191
 * A2: max ~1684
 * A1: max ~2384
 * A0: max ~3370
 */
export async function checkPdfSize(file: File): Promise<string | null> {
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    return null;
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer);
    const pages = pdfDoc.getPages();
    
    if (pages.length > 0) {
      const { width, height } = pages[0].getSize();
      const maxDim = Math.max(width, height);
      
      // A3 max dimension is around 1191 points. We use 1200 as threshold.
      if (maxDim > 1200) {
        if (maxDim > 2300) return 'A0 oder größer';
        if (maxDim > 1600) return 'A1';
        if (maxDim > 1200) return 'A2';
      }
    }
  } catch (error) {
    console.error('Fehler beim Prüfen der PDF-Größe:', error);
  }
  
  return null;
}
