import { describe, it, expect } from 'vitest';
import { isAdmin, isClient, isGuest, canEditOrder } from '../../utils/authHelpers';
import { User, Order } from '../../types';

describe('authHelpers', () => {
  describe('isAdmin', () => {
    it('sollte true für echte Admins zurückgeben', () => {
      expect(isAdmin({ role: 'admin' } as User)).toBe(true);
    });

    it('sollte false für Gäste und Auftraggeber zurückgeben', () => {
      expect(isAdmin({ role: 'guest' } as User)).toBe(false);
      expect(isAdmin({ role: 'client' } as User)).toBe(false);
    });

    it('sollte Bypass-Versuche durch leere oder manipulierte Objekte verhindern', () => {
      expect(isAdmin(null)).toBe(false);
      expect(isAdmin(undefined)).toBe(false);
      expect(isAdmin({} as User)).toBe(false);
      expect(isAdmin({ role: '' } as User)).toBe(false);
      expect(isAdmin({ ROLE: 'admin' } as any)).toBe(false); // Falsches Casing
    });
  });

  describe('canEditOrder', () => {
    const draftOrder = { status: 'draft' } as Order;
    const activeOrder = { status: 'in-progress' } as Order;

    it('sollte Admins und Mitarbeitern immer die Bearbeitung erlauben', () => {
      expect(canEditOrder({ role: 'admin' } as User, activeOrder)).toBe(true);
      expect(canEditOrder({ role: 'manager' } as User, activeOrder)).toBe(true);
      expect(canEditOrder({ role: 'employee' } as User, activeOrder)).toBe(true);
    });

    it('sollte Clients NUR bei Drafts (Entwürfen) die Bearbeitung erlauben', () => {
      expect(canEditOrder({ role: 'client' } as User, draftOrder)).toBe(true);
      expect(canEditOrder({ role: 'client' } as User, activeOrder)).toBe(false); // Darf laufende Aufträge nicht ändern
    });

    it('sollte Gästen NIEMALS die Bearbeitung erlauben', () => {
      expect(canEditOrder({ role: 'guest' } as User, draftOrder)).toBe(false);
      expect(canEditOrder({ role: 'guest' } as User, activeOrder)).toBe(false);
    });

    it('sollte false zurückgeben, wenn Daten fehlen (Sicherheitsnetz)', () => {
      expect(canEditOrder(null, draftOrder)).toBe(false);
      expect(canEditOrder({ role: 'admin' } as User, null)).toBe(false);
      expect(canEditOrder({} as User, {} as Order)).toBe(false);
    });
  });
});
