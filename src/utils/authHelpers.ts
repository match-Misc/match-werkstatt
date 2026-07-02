import { User, Order } from '../types';

/**
 * Prüft ob der übergebene Benutzer Admin-Rechte besitzt.
 * Verhindert Bypasses durch unvollständige oder manipulierte User-Objekte.
 */
export function isAdmin(user: User | null | undefined): boolean {
  if (!user || typeof user !== 'object') return false;
  return user.role === 'admin';
}

/**
 * Prüft ob der Benutzer ein reiner Auftraggeber (Client) ist.
 */
export function isClient(user: User | null | undefined): boolean {
  if (!user || typeof user !== 'object') return false;
  return user.role === 'client';
}

/**
 * Prüft ob der Benutzer ein Gast ist.
 */
export function isGuest(user: User | null | undefined): boolean {
  if (!user || typeof user !== 'object') return false;
  return user.role === 'guest';
}

/**
 * Prüft, ob ein Benutzer berechtigt ist, den Auftrag grundlegend zu bearbeiten (z.B. Löschen, Status ändern).
 * - Admins, Manager und Workshop-Mitarbeiter dürfen immer bearbeiten.
 * - Auftraggeber (Clients) dürfen nur bearbeiten, wenn der Auftrag noch ein "draft" ist.
 * - Gäste dürfen nie bearbeiten.
 */
export function canEditOrder(user: User | null | undefined, order: Order | null | undefined): boolean {
  if (!user || typeof user !== 'object' || !user.role) return false;
  if (!order || typeof order !== 'object') return false;

  const allowedInternalRoles = ['admin', 'manager', 'workshop', 'employee'];
  
  if (allowedInternalRoles.includes(user.role)) {
    return true;
  }

  if (user.role === 'client') {
    // Auftraggeber dürfen nur Entwürfe bearbeiten
    return order.status === 'draft';
  }

  // Gäste oder unbekannte Rollen
  return false;
}
