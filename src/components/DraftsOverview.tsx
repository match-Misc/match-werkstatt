import { useState, useEffect } from 'react';
import { Edit2, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useApp } from '../context/AppContext';
import { Order } from '../types';

export default function DraftsOverview() {
  const { state } = useApp();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [drafts, setDrafts] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [sortConfig, setSortConfig] = useState<{ key: keyof Order | 'orderNumber', direction: 'asc' | 'desc' }>({ 
    key: 'createdAt', 
    direction: 'desc' 
  });

  const handleSort = (key: keyof Order | 'orderNumber') => {
    setSortConfig(current => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const getSortedDrafts = (ordersToSort: Order[]) => {
    return [...ordersToSort].sort((a, b) => {
      let aVal: any = a[sortConfig.key as keyof Order];
      let bVal: any = b[sortConfig.key as keyof Order];

      if (sortConfig.key === 'orderNumber') {
        aVal = a.orderNumber || a.id;
        bVal = b.orderNumber || b.id;
      } else if (sortConfig.key === 'title') {
        aVal = a.title?.toLowerCase() || '';
        bVal = b.title?.toLowerCase() || '';
      } else if (sortConfig.key === 'createdAt') {
        aVal = new Date(a.createdAt).getTime();
        bVal = new Date(b.createdAt).getTime();
      }

      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  };

  const fetchDrafts = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/drafts');
      if (res.ok) {
        const data = await res.json();
        setDrafts(data);
      }
    } catch (err) {
      console.error('Error fetching drafts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDrafts();
  }, []);

  const sortedDrafts = getSortedDrafts(drafts);

  const renderSortIcon = (key: string) => {
    if (sortConfig.key !== key) return <ArrowUpDown className="w-4 h-4 ml-1 opacity-50" />;
    return sortConfig.direction === 'asc' ? <ArrowUp className="w-4 h-4 ml-1" /> : <ArrowDown className="w-4 h-4 ml-1" />;
  };

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">{t('dashboard.drafts', 'Entwürfe')}</h2>
        <p className="text-gray-600 mt-1">{t('dashboard.draftsDesc', 'Verwalten Sie Ihre gespeicherten, aber noch nicht eingereichten Aufträge.')}</p>
      </div>

      {loading ? (
        <div className="flex justify-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : sortedDrafts.length > 0 ? (
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('orderNumber')}
                  >
                    <div className="flex items-center">
                      {t('dashboard.orderNo', 'Auftrags-Nr')}
                      {renderSortIcon('orderNumber')}
                    </div>
                  </th>
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('title')}
                  >
                    <div className="flex items-center">
                      {t('dashboard.title', 'Titel')}
                      {renderSortIcon('title')}
                    </div>
                  </th>
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('createdAt')}
                  >
                    <div className="flex items-center">
                      {t('dashboard.createdAt', 'Erstellt am')}
                      {renderSortIcon('createdAt')}
                    </div>
                  </th>
                  {state.currentUser?.role !== 'client' && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('dashboard.client', 'Auftraggeber')}
                    </th>
                  )}
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {t('dashboard.actions', 'Aktionen')}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sortedDrafts.map((draft) => (
                  <tr key={draft.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {draft.orderNumber || draft.id}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                      {draft.title || t('dashboard.untitledDraft', 'Unbenannter Entwurf')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(draft.createdAt).toLocaleDateString('de-DE')}
                    </td>
                    {state.currentUser?.role !== 'client' && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {draft.clientName}
                      </td>
                    )}
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => navigate(`/orders/${draft.orderNumber || draft.id}/edit`)}
                        className="inline-flex items-center text-blue-600 hover:text-blue-900 bg-blue-50 px-3 py-1 rounded-md"
                        title={t('dashboard.continueDraft', 'Entwurf bearbeiten / Weitermachen')}
                      >
                        <Edit2 className="w-4 h-4 mr-2" />
                        {t('dashboard.continue', 'Weitermachen')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="text-center py-12 bg-white rounded-lg shadow-sm border border-gray-200">
          <p className="text-gray-500">{t('dashboard.noDrafts', 'Keine Entwürfe gefunden.')}</p>
        </div>
      )}
    </div>
  );
}
