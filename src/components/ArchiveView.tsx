import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Order } from '../types';
import OrderDetails from './OrderDetails';
import { Eye, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';


import { orderColumns } from './WorkshopDashboard';
import { ColumnConfigDropdown, useTableColumns } from './ColumnConfigDropdown';

const archiveColumns = [
  ...orderColumns.filter(c => ['orderNumber', 'projectName', 'title', 'clientName', 'status', 'actions'].includes(c.id)),
  { id: 'acceptedDate', label: 'Auftrag angenommen' },
  { id: 'completedDate', label: 'Auftrag abgeschlossen' },
  { id: 'confirmationDate', label: 'Auftrag abgenommen' }
];

export default function ArchiveView() {
  const { isVisible } = useTableColumns('archive');
  const { state } = useApp();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { orderNumber } = useParams<{ orderNumber: string }>();
  const [sortConfig, setSortConfig] = useState<{ key: keyof Order | 'orderNumber', direction: 'asc' | 'desc' }>({ 
    key: 'orderNumber', 
    direction: 'desc' 
  });

  const handleSort = (key: keyof Order | 'orderNumber') => {
    setSortConfig(current => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const getSortedOrders = (orders: Order[]) => {
    return [...orders].sort((a, b) => {
      let aVal: any = a[sortConfig.key as keyof Order];
      let bVal: any = b[sortConfig.key as keyof Order];

      if (sortConfig.key === 'orderNumber') {
        aVal = a.orderNumber || a.id;
        bVal = b.orderNumber || b.id;
      } else if (sortConfig.key === 'title') {
        aVal = a.title?.toLowerCase() || '';
        bVal = b.title?.toLowerCase() || '';
      } else if (sortConfig.key === 'clientName') {
        aVal = a.clientName?.toLowerCase() || '';
        bVal = b.clientName?.toLowerCase() || '';
      } else if (sortConfig.key === 'status') {
        aVal = a.status || '';
        bVal = b.status || '';
      }

      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  };

  const archivedOrders = getSortedOrders(state.orders.filter(order => order.status === 'archived'));

  const getTitleImageUrl = (order: Order) => {
    if (order.titleImage) { // Prüft, ob das Feld existiert (nach DB-Migration)
      // Hänge einen Zeitstempel an, um Caching zu umgehen, falls das Bild aktualisiert wird
      return `/api/orders/${order.id}/title-image?t=${new Date(order.updatedAt).getTime()}`;
    }
    return undefined; // Kein Bild vorhanden
  };

  const selectedOrder = orderNumber 
    ? state.orders.find(o => (o.orderNumber || o.id) === orderNumber) 
    : null;

  if (selectedOrder) {
    return <OrderDetails order={selectedOrder} onClose={() => navigate('/archive')} />;
  }

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
      {archivedOrders.length === 0 ? (
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900">{t('archive.title', 'Archivierte Aufträge')}</h2>
          <p className="text-gray-500 mt-4">{t('archive.empty', 'Keine archivierten Aufträge vorhanden.')}</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="p-4 border-b flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-900">{t('archive.title', 'Archivierte Aufträge')}</h2>
            <ColumnConfigDropdown columns={archiveColumns} tableId="archive" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('orderNumber')}>
                    <div className="flex items-center space-x-1">
                      <span>{t('dashboard.columns.order', 'Auftrag')}</span>
                      {sortConfig.key === 'orderNumber' ? (sortConfig.direction === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />) : <ArrowUpDown className="w-4 h-4 opacity-0 group-hover:opacity-100" />}
                    </div>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('clientName')}>
                    <div className="flex items-center space-x-1">
                      <span>{t('dashboard.columns.clientName', 'Auftraggeber')}</span>
                      {sortConfig.key === 'clientName' ? (sortConfig.direction === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />) : <ArrowUpDown className="w-4 h-4 opacity-0 group-hover:opacity-100" />}
                    </div>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('status')}>
                    <div className="flex items-center space-x-1">
                      <span>{t('common.status', 'Status')}</span>
                      {sortConfig.key === 'status' ? (sortConfig.direction === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />) : <ArrowUpDown className="w-4 h-4 opacity-0 group-hover:opacity-100" />}
                    </div>
                  </th>
                  {isVisible('acceptedDate') && (
                    <th 
                      scope="col" 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('acceptedDate' as any)}
                    >
                      {t('dashboard.columns.acceptedDate', 'Auftrag angenommen')} {sortConfig.key === 'acceptedDate' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                    </th>
                  )}
                  {isVisible('completedDate') && (
                    <th 
                      scope="col" 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('waitingConfirmationSince' as any)}
                    >
                      {t('dashboard.columns.completedDate', 'Auftrag abgeschlossen')} {sortConfig.key === 'waitingConfirmationSince' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                    </th>
                  )}
                  {isVisible('confirmationDate') && (
                    <th 
                      scope="col" 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('confirmationDate' as any)}
                    >
                      {t('dashboard.columns.confirmationDate', 'Auftrag abgenommen')} {sortConfig.key === 'confirmationDate' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                    </th>
                  )}
                  {isVisible('actions') && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('dashboard.columns.actions', 'Aktionen')}</th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {archivedOrders.map((order) => {
                  const imageUrl = getTitleImageUrl(order);
                  return (
                    <tr 
                      key={order.id} 
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => navigate(`/archive/${order.orderNumber || order.id}`)}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-4">
                          {imageUrl && (
                            <img src={imageUrl} alt={order.title} className="w-12 h-12 object-cover rounded-md" />
                          )}
                          <div>
                            <div className="text-sm font-medium text-gray-900">{order.title}</div>
                            <div className="text-xs text-gray-500 font-mono">{order.orderNumber || order.id}</div>
                          </div>
                        </div>
                      </td>
                      {isVisible('clientName') && (
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{order.clientName}</div>
                          <div className="text-sm text-gray-500">{order.costCenter}</div>
                        </td>
                      )}
                      {isVisible('status') && (
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-800">
                            {t('dashboard.archived', 'Archiviert')}
                          </span>
                        </td>
                      )}
                      {isVisible('acceptedDate') && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {order.acceptedDate ? new Date(order.acceptedDate).toLocaleDateString('de-DE') : '-'}
                        </td>
                      )}
                      {isVisible('completedDate') && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {order.confirmationDate ? new Date(order.confirmationDate).toLocaleDateString('de-DE') : (order.waitingConfirmationSince ? new Date(order.waitingConfirmationSince).toLocaleDateString('de-DE') : '-')}
                        </td>
                      )}
                      {isVisible('confirmationDate') && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {order.confirmationDate ? new Date(order.confirmationDate).toLocaleDateString('de-DE') : '-'}
                        </td>
                      )}
                      {isVisible('actions') && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex space-x-3">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/archive/${order.orderNumber || order.id}`);
                              }}
                              className="text-blue-600 hover:text-blue-800 flex items-center"
                            >
                              <Eye className="w-4 h-4 mr-1" />
                              {t('common.view', 'Anzeigen')}
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
