import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useApp } from '../context/AppContext';
import { Order } from '../types';

export default function DeleteDraftButton({ draft, iconOnly = false, onDeleted }: { draft: Order; iconOnly?: boolean; onDeleted?: () => void }) {
  const { dispatch } = useApp();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);
  if (draft.status !== 'Entwurf') return null;
  const label = t('drafts.delete', 'Entwurf löschen');
  const remove = async () => {
    if (!window.confirm(t('drafts.deleteConfirm', 'Entwurf {{number}} endgültig löschen? Alle Angaben und Anhänge dieses Entwurfs werden gelöscht.', { number: draft.orderNumber || draft.id }))) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/drafts/${encodeURIComponent(draft.id)}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || t('drafts.deleteError', 'Entwurf konnte nicht gelöscht werden'));
      }
      dispatch({ type: 'DELETE_ORDER', payload: draft.id });
      dispatch({ type: 'SHOW_NOTIFICATION', payload: { type: 'success', message: t('drafts.deleted', 'Entwurf gelöscht') } });
      if (onDeleted) onDeleted();
      else navigate('/drafts');
    } catch (error) {
      dispatch({ type: 'SHOW_NOTIFICATION', payload: { type: 'error', message: error instanceof Error ? error.message : t('drafts.deleteError', 'Entwurf konnte nicht gelöscht werden') } });
      setDeleting(false);
    }
  };
  return <button type="button" disabled={deleting} title={label} aria-label={iconOnly ? `${label}: ${draft.orderNumber || draft.id}` : undefined}
    onClick={event => { event.stopPropagation(); void remove(); }}
    className={`inline-flex items-center justify-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 ${iconOnly ? 'p-2' : 'px-4 py-2'}`}>
    <Trash2 className={`w-4 h-4 ${iconOnly ? '' : 'mr-2'}`} />
    {!iconOnly && label}
  </button>;
}
