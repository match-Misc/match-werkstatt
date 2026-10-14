import { useState } from 'react';
import { Copy } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useApp } from '../context/AppContext';
import { Order } from '../types';

export default function DuplicateOrderButton({ order }: { order: Order }) {
  const { state, dispatch } = useApp();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [copying, setCopying] = useState(false);
  const user = state.currentUser;
  if (!user || !(['admin', 'manager', 'employee'].includes(user.role) || (user.role === 'client' && order.clientId === user.id))) return null;

  const duplicate = async () => {
    setCopying(true);
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(order.id)}/duplicate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resetWork: true })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || t('orderDetails.duplicateError', 'Auftrag konnte nicht dupliziert werden'));
      dispatch({ type: 'SHOW_NOTIFICATION', payload: { type: 'success', message: t('orderDetails.duplicateSuccess', 'Auftrag als Entwurf dupliziert') } });
      navigate(`/orders/${encodeURIComponent(result.orderNumber || result.id)}/edit`);
    } catch (error) {
      dispatch({ type: 'SHOW_NOTIFICATION', payload: { type: 'error', message: error instanceof Error ? error.message : t('orderDetails.duplicateError', 'Auftrag konnte nicht dupliziert werden') } });
      setCopying(false);
    }
  };

  return (
    <button type="button" disabled={copying} onClick={duplicate}
      className="flex items-center px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-wait">
      <Copy className="w-4 h-4 mr-2" />
      {copying ? t('orderDetails.duplicating', 'Wird dupliziert…') : t('orderDetails.duplicate', 'Auftrag duplizieren')}
    </button>
  );
}
