function canDeleteDraft(user, order) {
  if (!user?.id || !order || order.status !== 'Entwurf') return false;
  if (['admin', 'manager'].includes(user.role)) return true;
  if (user.role === 'client') return String(order.clientId) === String(user.id);
  if (user.role === 'employee') return String(order.createdBy) === String(user.id) || String(order.clientId) === String(user.id);
  return false;
}
module.exports = { canDeleteDraft };
