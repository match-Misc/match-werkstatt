import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Order } from '../types';
import OrderDetails from './OrderDetails';
import { Eye, RefreshCcw, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

export default function ArchiveView() {
  const { state, dispatch } = useApp();
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
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

  const handleRestore = async (order: Order) => {
    try {
      // Update server first
      const response = await fetch(`/api/orders/${order.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'revision' })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        dispatch({ type: 'SHOW_NOTIFICATION', payload: { message: `Fehler: ${errorData.error || 'Unbekannt'}`, type: 'error' } });
        return;
      }
      
      // Get updated order from server response
      const updatedOrder = await response.json();
      
      // Update local state with server response
      dispatch({ type: 'UPDATE_ORDER', payload: updatedOrder });
      dispatch({ type: 'SHOW_NOTIFICATION', payload: { message: 'Auftrag zur Nachbearbeitung freigegeben', type: 'success' } });
    } catch (error) {
      dispatch({ type: 'SHOW_NOTIFICATION', payload: { message: 'Netzwerkfehler beim Wiederherstellen des Auftrags', type: 'error' } });
    }
  };

  if (selectedOrder) {
    return <OrderDetails order={selectedOrder} onClose={() => setSelectedOrder(null)} />;
  }

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Archivierte Aufträge</h2>
      </div>
      {archivedOrders.length === 0 ? (
        <p className="text-gray-500">Keine archivierten Aufträge vorhanden.</p>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('orderNumber')}>
                    <div className="flex items-center space-x-1">
                      <span>Auftrag</span>
                      {sortConfig.key === 'orderNumber' ? (sortConfig.direction === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />) : <ArrowUpDown className="w-4 h-4 opacity-0 group-hover:opacity-100" />}
                    </div>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('clientName')}>
                    <div className="flex items-center space-x-1">
                      <span>Auftraggeber</span>
                      {sortConfig.key === 'clientName' ? (sortConfig.direction === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />) : <ArrowUpDown className="w-4 h-4 opacity-0 group-hover:opacity-100" />}
                    </div>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('status')}>
                    <div className="flex items-center space-x-1">
                      <span>Status</span>
                      {sortConfig.key === 'status' ? (sortConfig.direction === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />) : <ArrowUpDown className="w-4 h-4 opacity-0 group-hover:opacity-100" />}
                    </div>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Aktionen</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {archivedOrders.map((order) => {
                  const imageUrl = getTitleImageUrl(order);
                  return (
                    <tr key={order.id} className="hover:bg-gray-50">
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
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{order.clientName}</div>
                        <div className="text-xs text-gray-500">{order.costCenter}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-800">
                          Archiviert
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex space-x-3">
                          <button
                            onClick={() => setSelectedOrder(order)}
                            className="text-blue-600 hover:text-blue-800 flex items-center"
                          >
                            <Eye className="w-4 h-4 mr-1" />
                            Anzeigen
                          </button>
                          <button
                            onClick={() => handleRestore(order)}
                            className="text-orange-600 hover:text-orange-800 flex items-center"
                          >
                            <RefreshCcw className="w-4 h-4 mr-1" />
                            Nacharbeiten
                          </button>
                        </div>
                      </td>
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
