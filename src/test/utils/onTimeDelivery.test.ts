import { describe, expect, it } from 'vitest';
import { getOnTimeDeliveryStatus } from '../../utils/onTimeDelivery';

describe('getOnTimeDeliveryStatus', () => {
  it('uses the workshop completion date instead of the client confirmation date', () => {
    expect(getOnTimeDeliveryStatus({
      deadline: new Date('2026-08-20'),
      waitingConfirmationSince: new Date('2026-08-20T10:00:00'),
      confirmationDate: new Date('2026-08-25T10:00:00'),
      reworkComments: []
    })).toBe('onTime');
  });

  it('counts orders requiring rework as late even when the workshop finished before the deadline', () => {
    expect(getOnTimeDeliveryStatus({
      deadline: new Date('2026-08-20'),
      waitingConfirmationSince: new Date('2026-08-19T10:00:00'),
      reworkComments: [{ comment: 'Bitte nacharbeiten' }]
    })).toBe('late');
  });

  it('does not classify legacy orders without a workshop completion date', () => {
    expect(getOnTimeDeliveryStatus({
      deadline: new Date('2026-08-20'),
      confirmationDate: new Date('2026-08-21T10:00:00'),
      reworkComments: []
    })).toBeNull();
  });
});
