import React from 'react';
import { describe, it, expect } from 'vitest';
import {
  isSTLFile,
  isCADFile,
  isIPTFile,
  isDWGFile,
  isZIPFile,
  isEMCAMFile,
  isImageFile,
  isPDFFile,
  getFileIcon,
  getFileTypeDescription,
} from '../../utils/fileIcons';

describe('fileIcons utils', () => {
  describe('File type detection', () => {
    it('detects STL files', () => {
      expect(isSTLFile('model.stl')).toBe(true);
      expect(isSTLFile('MODEL.STL')).toBe(true);
      expect(isSTLFile('model.txt')).toBe(false);
    });

    it('detects CAD files', () => {
      expect(isCADFile('part.step')).toBe(true);
      expect(isCADFile('part.stp')).toBe(true);
      expect(isCADFile('part.iges')).toBe(true);
      expect(isCADFile('part.igs')).toBe(true);
      expect(isCADFile('part.stl')).toBe(false);
    });

    it('detects IPT/IAM files', () => {
      expect(isIPTFile('assembly.iam')).toBe(true);
      expect(isIPTFile('part.ipt')).toBe(true);
      expect(isIPTFile('part.step')).toBe(false);
    });

    it('detects DWG files', () => {
      expect(isDWGFile('drawing.dwg')).toBe(true);
      expect(isDWGFile('drawing.DWG')).toBe(true);
    });

    it('detects image files (including double extensions)', () => {
      expect(isImageFile('image.png')).toBe(true);
      expect(isImageFile('image.jpg')).toBe(true);
      expect(isImageFile('image.jpeg')).toBe(true);
      // Double extension test case
      expect(isImageFile('image.png.PNG')).toBe(true);
      expect(isImageFile('Müller-Testbild.png')).toBe(true);
      expect(isImageFile('Müller-Testbild.png.PNG')).toBe(true);
    });

    it('detects PDF files', () => {
      expect(isPDFFile('document.pdf')).toBe(true);
      expect(isPDFFile('Müller-Testdatei.pdf')).toBe(true);
      expect(isPDFFile('Müller-Testdatei.txt')).toBe(false);
    });
  });

  describe('getFileTypeDescription', () => {
    it('returns correct description for files including ones with Umlaute', () => {
      expect(getFileTypeDescription('Müller-Testdatei.stl')).toBe('3D-Modell (STL)');
      expect(getFileTypeDescription('Änderung.ipt')).toBe('CAD-Modell (IPT/IAM)');
      expect(getFileTypeDescription('Überblick.step')).toBe('3D-Modell/CAD');
      expect(getFileTypeDescription('Maße.dwg')).toBe('Zeichnung (DWG)');
      expect(getFileTypeDescription('Foto-Ü.png')).toBe('Bilddatei');
      expect(getFileTypeDescription('Doku_ÄÖÜ.pdf')).toBe('PDF-Dokument');
      expect(getFileTypeDescription('Müller-Testdatei.txt')).toBe('Dokument');
    });
  });

  describe('getFileIcon', () => {
    it('returns the correct icon component for different files', () => {
      // By checking the type of the returned React element (functional component)
      const stlIcon = getFileIcon('model.stl');
      expect(stlIcon.type.displayName || stlIcon.type.name).toBe('Server');

      const iptIcon = getFileIcon('part.ipt');
      expect(iptIcon.type.displayName || iptIcon.type.name).toBe('Box');

      const cadIcon = getFileIcon('part.step');
      expect(cadIcon.type.displayName || cadIcon.type.name).toBe('Box');

      const dwgIcon = getFileIcon('drawing.dwg');
      expect(dwgIcon.type.displayName || dwgIcon.type.name).toBe('PenTool');

      const imageIcon = getFileIcon('image.png.PNG');
      expect(imageIcon.type.displayName || imageIcon.type.name).toBe('FileImage');

      const pdfIcon = getFileIcon('document.pdf');
      expect(pdfIcon.type.displayName || pdfIcon.type.name).toBe('FileText');

      // Fallback for .txt
      const txtIcon = getFileIcon('Müller-Testdatei.txt');
      expect(txtIcon.type.displayName || txtIcon.type.name).toBe('File');
    });
  });
});
