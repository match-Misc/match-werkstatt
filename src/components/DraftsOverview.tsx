import { useState, useEffect } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useApp } from '../context/AppContext';
import { Order } from '../types';
import DeleteDraftButton from './DeleteDraftButton';

type SortKey = 'orderNumber' | 'projectName' | 'title' | 'deadline';
const columns: { key: SortKey; label: string }[] = [
  { key: 'orderNumber', label: 'Auftragsnummer' },
  { key: 'projectName', label: 'Projektname' },
  { key: 'title', label: 'Auftragstitel' },
  { key: 'deadline', label: 'Deadline' }
];

export default function DraftsOverview() {
  const { dispatch } = useApp();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [drafts, setDrafts] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'orderNumber', direction: 'desc' });

  useEffect(() => {
    let active = true;
    fetch('/api/drafts').then(async response => {
      if (!response.ok) throw new Error(t('drafts.loadError', 'Entwürfe konnten nicht geladen werden'));
      const data = await response.json();
      if (active) setDrafts(data);
    }).catch(error => {
      if (active) dispatch({ type: 'SHOW_NOTIFICATION', payload: { type: 'error', message: error.message } });
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [dispatch, t]);

  const sortedDrafts = [...drafts].sort((a, b) => {
    let compared: number;
    if (sortConfig.key === 'deadline') compared = (a.deadline ? new Date(a.deadline).getTime() : 0) - (b.deadline ? new Date(b.deadline).getTime() : 0);
    else compared = String(a[sortConfig.key] || '').localeCompare(String(b[sortConfig.key] || ''), 'de', { numeric: true });
    return sortConfig.direction === 'asc' ? compared : -compared;
  });

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">{t('dashboard.drafts', 'Entwürfe')}</h2>
        <p className="text-gray-600 mt-1">{t('dashboard.draftsDesc', 'Verwalten Sie Ihre gespeicherten, aber noch nicht eingereichten Aufträge.')}</p>
      </div>
      {loading ? (
        <div className="flex justify-center p-8"><div role="status" aria-label={t('common.loading', 'Wird geladen')} className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
      ) : sortedDrafts.length ? (
        <div className="bg-white rounded-lg shadow-sm border overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200" style={{ overflowAnchor: 'none' }}>
            <thead className="bg-gray-50">
              <tr>
                {columns.map(column => (
                  <th key={column.key} scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    aria-sort={sortConfig.key === column.key ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    <button type="button" className="flex items-center hover:text-gray-900" onClick={() => setSortConfig(current => ({ key: column.key, direction: current.key === column.key && current.direction === 'asc' ? 'desc' : 'asc' }))}>
                      {t(`dashboard.columns.${column.key}`, column.label)}
                      {sortConfig.key === column.key ? (sortConfig.direction === 'asc' ? <ArrowUp className="w-4 h-4 ml-1" /> : <ArrowDown className="w-4 h-4 ml-1" />) : <ArrowUpDown className="w-4 h-4 ml-1" />}
                    </button>
                  </th>
                ))}
                <th scope="col" className="px-6 py-3 text-right"><span className="sr-only">{t('drafts.delete', 'Entwurf löschen')}</span></th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sortedDrafts.map(draft => (
                <tr key={draft.id} tabIndex={0} className="hover:bg-gray-50 transition-colors cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
                  onClick={() => navigate(`/orders/${encodeURIComponent(draft.orderNumber || draft.id)}/edit`)}
                  onKeyDown={event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); navigate(`/orders/${encodeURIComponent(draft.orderNumber || draft.id)}/edit`); } }}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">{draft.orderNumber || '—'}</td>
                  <td className="px-6 py-4 text-sm text-gray-900">{draft.projectName || '—'}</td>
                  <td className="px-6 py-4 text-sm text-gray-900">{draft.title || '—'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{draft.deadline && !Number.isNaN(new Date(draft.deadline).getTime()) ? new Date(draft.deadline).toLocaleDateString('de-DE') : '—'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-right"><DeleteDraftButton draft={draft} iconOnly onDeleted={() => setDrafts(current => current.filter(order => order.id !== draft.id))} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <div className="text-center py-12 bg-white rounded-lg shadow-sm border border-gray-200"><p className="text-gray-500">{t('dashboard.noDrafts', 'Keine Entwürfe gefunden.')}</p></div>}
    </div>
  );
}
