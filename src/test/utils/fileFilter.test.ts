import { describe, it, expect } from 'vitest';
import { isRestrictedFile } from '../../utils/fileFilter';

describe('fileFilter', () => {
  describe('isRestrictedFile', () => {
    it('sollte false zurückgeben, wenn keine Restriktionen definiert sind', () => {
      expect(isRestrictedFile('modell.nc', [])).toBe(false);
    });

    it('sollte false zurückgeben, wenn der Dateiname ungültig ist', () => {
      expect(isRestrictedFile(null, ['nc'])).toBe(false);
      expect(isRestrictedFile(undefined, ['nc'])).toBe(false);
      expect(isRestrictedFile('', ['nc'])).toBe(false);
    });

    it('sollte true zurückgeben, wenn die Dateiendung in der Liste steht', () => {
      expect(isRestrictedFile('bauteil.nc', ['nc', 'gcode'])).toBe(true);
      expect(isRestrictedFile('zeichnung.step', ['step'])).toBe(true);
    });

    it('sollte false zurückgeben, wenn die Endung nicht in der Liste steht', () => {
      expect(isRestrictedFile('dokument.pdf', ['nc', 'gcode'])).toBe(false);
    });

    it('sollte Case-Insensitive arbeiten (Ignoriert Groß-/Kleinschreibung)', () => {
      // Dateiendung ist groß, Restriktion klein
      expect(isRestrictedFile('modell.NC', ['nc'])).toBe(true);
      // Dateiendung ist klein, Restriktion groß
      expect(isRestrictedFile('bauteil.gcode', ['GCODE'])).toBe(true);
      // Mischmasch
      expect(isRestrictedFile('teil.StEp', ['sTeP'])).toBe(true);
    });
  });
});
