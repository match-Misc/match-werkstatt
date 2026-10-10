function shouldAutoStartOrder(order, nextSubTasks, requestedStatus) {
  if (!['pending', 'accepted', 'rework'].includes(order.status)) return false;
  if (requestedStatus !== undefined && requestedStatus !== order.status) return false;
  if (!Array.isArray(nextSubTasks)) return false;

  return nextSubTasks.some(task =>
    task.status === 'in_progress' &&
    order.subTasks?.some(previous => previous.id === task.id && previous.status === 'pending')
  );
}

module.exports = { shouldAutoStartOrder };
