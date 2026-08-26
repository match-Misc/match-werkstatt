import type { Order } from '../types';

type OnTimeDeliveryOrder = Pick<Order, 'deadline' | 'waitingConfirmationSince' | 'reworkComments'>;

export function getOnTimeDeliveryStatus(order: OnTimeDeliveryOrder): 'onTime' | 'late' | null {
  const deadline = order.deadline ? new Date(order.deadline) : null;
  if (!deadline || Number.isNaN(deadline.getTime())) {
    return null;
  }

  if (order.reworkComments?.length) {
    return 'late';
  }

  const workshopCompletionDate = order.waitingConfirmationSince
    ? new Date(order.waitingConfirmationSince)
    : null;
  if (!workshopCompletionDate || Number.isNaN(workshopCompletionDate.getTime())) {
    return null;
  }

  deadline.setHours(0, 0, 0, 0);
  workshopCompletionDate.setHours(0, 0, 0, 0);
  return workshopCompletionDate <= deadline ? 'onTime' : 'late';
}
