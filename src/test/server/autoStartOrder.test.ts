import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { shouldAutoStartOrder } = require('../../../server/utils/autoStartOrder.cjs');

const pendingTask = { id: 'task-1', status: 'pending' };

describe('shouldAutoStartOrder', () => {
  it.each(['pending', 'accepted', 'rework'])('starts a %s order when a pending task begins', status => {
    const order = { status, subTasks: [pendingTask] };
    expect(shouldAutoStartOrder(order, [{ ...pendingTask, status: 'in_progress' }], status)).toBe(true);
  });

  it('does not start an order for an unrelated task edit', () => {
    const order = { status: 'pending', subTasks: [pendingTask] };
    expect(shouldAutoStartOrder(order, [pendingTask], 'pending')).toBe(false);
  });

  it('does not replace an explicit order status change', () => {
    const order = { status: 'pending', subTasks: [pendingTask] };
    expect(shouldAutoStartOrder(order, [{ ...pendingTask, status: 'in_progress' }], 'revision')).toBe(false);
  });

  it('does not restart an order in final acceptance', () => {
    const order = { status: 'waiting_confirmation', subTasks: [pendingTask] };
    expect(shouldAutoStartOrder(order, [{ ...pendingTask, status: 'in_progress' }])).toBe(false);
  });
});
