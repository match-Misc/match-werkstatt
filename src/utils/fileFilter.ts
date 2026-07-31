/**
 * Prüft, ob eine Datei anhand ihrer Dateiendung blockiert werden soll.
 * 
 * @param filename Der Name der Datei (z.B. "modell.step")
 * @param restrictedExtensions Liste an verbotenen Endungen (z.B. ["nc", "step"])
 * @returns true wenn die Datei blockiert ist, false wenn sie erlaubt ist
 */
export function isRestrictedFile(filename: string | undefined | null, restrictedExtensions: string[]): boolean {
  if (!filename || !restrictedExtensions || restrictedExtensions.length === 0) return false;
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  // Vergleiche ohne den führenden Punkt
  return restrictedExtensions.some(e => {
    const eWithoutDot = e.startsWith('.') ? e.substring(1) : e;
    return eWithoutDot.toLowerCase() === ext;
  });
}
