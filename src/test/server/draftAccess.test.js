import { describe, expect, it } from 'vitest';
import { canDeleteDraft } from '../../../server/utils/draftAccess.cjs';

describe('Entwurf löschen', () => {
  const draft = { status: 'Entwurf', clientId: 'client-1', createdBy: 'employee-1' };
  it('erlaubt Auftraggebern nur eigene Entwürfe', () => {
    expect(canDeleteDraft({ id: 'client-1', role: 'client' }, draft)).toBe(true);
    expect(canDeleteDraft({ id: 'client-2', role: 'client' }, draft)).toBe(false);
  });
  it.each(['pending', 'in_progress', 'completed', 'archived'])('verweigert eingereichte Aufträge mit Status %s', status => {
    expect(canDeleteDraft({ id: 'client-1', role: 'client' }, { ...draft, status })).toBe(false);
  });
  it('erlaubt internen Erstellern ihre Entwürfe und verweigert Fremdzugriffe', () => {
    expect(canDeleteDraft({ id: 'employee-1', role: 'employee' }, draft)).toBe(true);
    expect(canDeleteDraft({ id: 'employee-2', role: 'employee' }, draft)).toBe(false);
    expect(canDeleteDraft({ id: 'manager-1', role: 'manager' }, draft)).toBe(true);
  });
  it('verweigert fehlende Benutzer und Gäste', () => {
    expect(canDeleteDraft(null, draft)).toBe(false);
    expect(canDeleteDraft({ id: 'guest', role: 'guest' }, draft)).toBe(false);
  });
});
