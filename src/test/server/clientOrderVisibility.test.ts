import { describe, expect, it } from 'vitest';
import { hideInternalOrderFields } from '../../../server/utils/orderAccess.cjs';

describe('Auftraggeberansicht', () => {
  it('entfernt interne Notizen und Stunden auch aus Unteraufgaben ohne Originaldaten zu ändern', () => {
    const order = { title: 'Test', estimatedHours: 10, actualHours: 7, internalWorkshopNote: 'intern', subTasks: [{ title: 'Teil', estimatedHours: 3, actualHours: 2 }] };
    expect(hideInternalOrderFields(order)).toEqual({ title: 'Test', subTasks: [{ title: 'Teil' }] });
    expect(order.actualHours).toBe(7);
    expect(order.subTasks[0].actualHours).toBe(2);
  });
});
