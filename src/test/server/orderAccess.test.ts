import { describe, expect, it } from 'vitest';
import { buildOrderAccessFilter } from '../../../server/utils/orderAccess.cjs';

describe('buildOrderAccessFilter', () => {
  it('beschränkt Auftraggeber auf ihre eigenen Aufträge', () => {
    expect(buildOrderAccessFilter('client', 'client-1')).toEqual({
      $or: [{ clientId: 'client-1' }],
    });
  });

  it.each(['employee', 'manager', 'admin'])('lässt %s alle Aufträge sehen', (role) => {
    expect(buildOrderAccessFilter(role, 'staff-1')).toEqual({});
  });

  it('verweigert Gästen den Auftragszugriff', () => {
    expect(buildOrderAccessFilter('guest', 'guest-1')).toEqual({ _id: null });
  });

  it('verweigert Auftraggebern ohne Sitzung den Auftragszugriff', () => {
    expect(buildOrderAccessFilter('client', null)).toEqual({ _id: null });
  });
});
