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

module.exports = { buildOrderAccessFilter };
