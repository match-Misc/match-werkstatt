// Hilfsfunktion zum Normalisieren von Pfaden für die Datenbank
export function normalizePath(path) {
  // Für Windows-Pfade: Konvertiere Backslashes zu Forward Slashes
  // Dies ist eine robustere Lösung, da Forward Slashes auch in Windows funktionieren
  // und keine Probleme mit JSON-Escaping verursachen
  return path.replace(/\\/g, '/');
}

// Hilfsfunktion zum Konvertieren von normalisierten Pfaden zurück zum nativen Format
export function denormalizePath(path) {
  if (process.platform === 'win32') {
    // Auf Windows: Konvertiere zurück zu Backslashes für bessere Lesbarkeit
    return path.replace(/\//g, '\\');
  }
  return path;
}
