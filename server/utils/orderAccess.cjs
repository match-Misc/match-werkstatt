function buildOrderAccessFilter(viewerRole, viewerId) {
  if (['employee', 'manager', 'admin'].includes(viewerRole)) {
    return {};
  }

  if (viewerRole !== 'client' || !viewerId) {
    return { _id: null };
  }

  return {
    $or: [{ clientId: viewerId.toString() }],
  };
}

function hideInternalOrderFields(order) {
  const { internalWorkshopNote, estimatedHours, actualHours, ...visibleOrder } = order;
  if (Array.isArray(order.subTasks)) {
    visibleOrder.subTasks = order.subTasks.map(({ estimatedHours, actualHours, ...task }) => task);
  }
  return visibleOrder;
}

module.exports = { buildOrderAccessFilter, hideInternalOrderFields };
