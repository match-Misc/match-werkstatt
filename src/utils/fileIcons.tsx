import React from 'react';
import { Box, Archive, Wrench, FileImage, FileText, File, Server, PenTool } from 'lucide-react';

export const isSTLFile = (fileName: string) => {
  return /\.stl$/i.test(fileName);
};

export const isCADFile = (fileName: string) => {
  return /\.(step|stp|iges|igs)$/i.test(fileName);
};

export const isIPTFile = (fileName: string) => {
  return /\.(ipt|iam)$/i.test(fileName);
};

export const isDWGFile = (fileName: string) => {
  return /\.dwg$/i.test(fileName);
};

export const isZIPFile = (fileName: string) => {
  return /\.zip$/i.test(fileName);
};

export const isEMCAMFile = (fileName: string) => {
  return /\.emcam$/i.test(fileName);
};

export const isImageFile = (fileName: string) => {
  return /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(fileName);
};

export const isPDFFile = (fileName: string) => {
  return /\.pdf$/i.test(fileName);
};

export const getFileIcon = (fileName: string, className = "w-5 h-5 mr-3") => {
  if (isSTLFile(fileName)) return <Server className={`${className} text-purple-600`} />;
  if (isIPTFile(fileName)) return <Box className={`${className} text-orange-500`} />;
  if (isCADFile(fileName)) return <Box className={`${className} text-blue-600`} />;
  if (isDWGFile(fileName)) return <PenTool className={`${className} text-blue-500`} />;
  if (isZIPFile(fileName)) return <Archive className={`${className} text-yellow-600`} />;
  if (isEMCAMFile(fileName)) return <Wrench className={`${className} text-teal-600`} />;
  if (isImageFile(fileName)) return <FileImage className={`${className} text-green-600`} />;
  if (isPDFFile(fileName)) return <FileText className={`${className} text-red-600`} />;
  return <File className={`${className} text-gray-500`} />;
};

export const getFileIconSmall = (fileName: string) => {
  return getFileIcon(fileName, "w-4 h-4 mr-2");
};

export const getFileTypeDescription = (fileName: string) => {
  if (isSTLFile(fileName)) return '3D-Modell (STL)';
  if (isIPTFile(fileName)) return 'CAD-Modell (IPT/IAM)';
  if (isCADFile(fileName)) return '3D-Modell/CAD';
  if (isDWGFile(fileName)) return 'Zeichnung (DWG)';
  if (isZIPFile(fileName)) return 'Archiv (ZIP)';
  if (isEMCAMFile(fileName)) return 'CAM-Datei (EMCAM)';
  if (isImageFile(fileName)) return 'Bilddatei';
  if (isPDFFile(fileName)) return 'PDF-Dokument';
  return 'Dokument';
};
