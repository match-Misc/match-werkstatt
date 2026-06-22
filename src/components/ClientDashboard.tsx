import { useState, useEffect } from 'react';
import { Plus, Clock, Eye, Edit2, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import OrderDetails from './OrderDetails';
import EditOrder from './EditOrder';
import EndabnahmeActions from './EndabnahmeActions';
import { Order } from '../types';

export default function ClientDashboard() {
  const { state, dispatch } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [orders, setOrders] = useState<Order[]>(state.orders);
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

  const getSortedOrders = (ordersToSort: Order[]) => {
    return [...ordersToSort].sort((a, b) => {
      let aVal: any = a[sortConfig.key as keyof Order];
      let bVal: any = b[sortConfig.key as keyof Order];

      if (sortConfig.key === 'orderNumber') {
        aVal = a.orderNumber || a.id;
        bVal = b.orderNumber || b.id;
      } else if (sortConfig.key === 'title') {
        aVal = a.title?.toLowerCase() || '';
        bVal = b.title?.toLowerCase() || '';
      } else if (sortConfig.key === 'deadline') {
        aVal = new Date(a.deadline).getTime();
        bVal = new Date(b.deadline).getTime();
      } else if (sortConfig.key === 'status') {
        aVal = a.status || '';
        bVal = b.status || '';
      }

      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  };

  // Orders nach jedem Öffnen/Schließen des Modals neu laden
  const fetchOrders = async () => {
    const viewerRole = state.currentUser?.role || 'client';
    const res = await fetch(`/api/orders?viewerRole=${encodeURIComponent(viewerRole)}`);
    const data = await res.json();
    setOrders(data);
    // Optional: globalen State aktualisieren
    if (dispatch) dispatch({ type: 'LOAD_ORDERS', payload: data });
  };

  useEffect(() => {
    setOrders(state.orders);
    
    // Handle opening specific order from QR code redirect
    const locationState = location.state as { openOrderId?: string } | null;
    if (locationState?.openOrderId && orders.length > 0) {
      const orderToOpen = orders.find(order => 
        (order.id === locationState.openOrderId || order.orderNumber === locationState.openOrderId) &&
        order.clientId === state.currentUser?.id // Only allow viewing own orders
      );
      
      if (orderToOpen) {
        setSelectedOrder(orderToOpen);
        dispatch({ 
          type: 'SHOW_NOTIFICATION', 
          payload: { message: `Auftrag "${orderToOpen.orderNumber || orderToOpen.id}" über QR-Code geöffnet.`, type: 'success' } 
        });
      }
    }
  }, [state.orders, location.state, orders, dispatch, state.currentUser?.id]);

  // Initial orders laden
  useEffect(() => {
    fetchOrders();
  }, []); // Nur einmal beim Mount

  const userOrders = orders.filter(order => 
    order.clientId === state.currentUser?.id && order.status !== 'archived'
  );

  const waitingOrders = getSortedOrders(userOrders.filter(order => order.status === 'waiting_confirmation'));
  // Aufträge zur Überarbeitung oder Nacharbeit werden im Dashboard angezeigt
  const otherOrders = getSortedOrders(userOrders.filter(order => order.status !== 'waiting_confirmation'));

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'accepted': return 'bg-blue-100 text-blue-800';
      case 'in_progress': return 'bg-purple-100 text-purple-800';
      case 'revision': return 'bg-orange-100 text-orange-800';
      case 'completed': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending': return 'Ausstehend';
      case 'accepted': return 'Angenommen';
      case 'in_progress': return 'In Bearbeitung';
      case 'revision': return 'Überarbeitung erforderlich';
      case 'rework': return 'Wird nachgearbeitet';
      case 'completed': return 'Abgeschlossen';
      default: return status;
    }
  };

  if (editingOrder) {
    return <EditOrder 
      order={editingOrder} 
      onClose={() => setEditingOrder(null)} 
      onOrderUpdated={fetchOrders}
    />;
  }

  if (selectedOrder) {
    return <OrderDetails order={selectedOrder} onClose={() => { setSelectedOrder(null); fetchOrders(); }} />;
  }

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Meine Aufträge</h2>
          <p className="text-gray-600 mt-1">Verwalten Sie Ihre Werkstattaufträge</p>
        </div>
        <button
          onClick={() => navigate('/orders/new')}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center"
        >
          <Plus className="w-4 h-4 mr-2" />
          Neuer Auftrag
        </button>
      </div>

      {/* Aktuelle Aufträge */}
      {otherOrders.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border mb-8">
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('deadline')}>
                    <div className="flex items-center space-x-1">
                      <span>Deadline</span>
                      {sortConfig.key === 'deadline' ? (sortConfig.direction === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />) : <ArrowUpDown className="w-4 h-4 opacity-0 group-hover:opacity-100" />}
                    </div>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('status')}>
                    <div className="flex items-center space-x-1">
                      <span>Status</span>
                      {sortConfig.key === 'status' ? (sortConfig.direction === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />) : <ArrowUpDown className="w-4 h-4 opacity-0 group-hover:opacity-100" />}
                    </div>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Geschätzt</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Aktionen</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {otherOrders.map((order) => (
                  <tr key={order.id} className={`hover:bg-gray-50 ${order.status === 'revision' ? 'bg-orange-50' : ''}`}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{order.title}</div>
                      <div className="text-xs text-gray-500 font-mono">{order.orderNumber || order.id}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{new Date(order.deadline).toLocaleDateString('de-DE')}</div>
                      <div className="text-xs text-gray-500">{order.costCenter}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(order.status)}`}>
                        {getStatusText(order.status)}
                      </span>
                      {order.status === 'revision' && (
                        <div className="mt-1 text-xs text-orange-600 font-medium">Bitte überarbeiten</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center text-sm text-gray-900">
                        <Clock className="w-4 h-4 text-gray-400 mr-1" />
                        {order.estimatedHours}h
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-3">
                        {(order.status === 'revision' || order.status === 'rework') && (
                          <button
                            onClick={() => setEditingOrder(order)}
                            className="text-orange-600 hover:text-orange-800 flex items-center"
                          >
                            <Edit2 className="w-4 h-4 mr-1" />
                            Bearbeiten
                          </button>
                        )}
                        <button
                          onClick={() => setSelectedOrder(order)}
                          className="text-blue-600 hover:text-blue-800 flex items-center"
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          Anzeigen
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {waitingOrders.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border mb-8">
          <div className="p-4 border-b">
            <h3 className="text-lg font-bold text-gray-900">Aufträge zur Endabnahme</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Auftrag</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[300px]">Aktionen</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {waitingOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50 bg-yellow-50/50">
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">{order.title}</div>
                      <div className="text-xs text-gray-500 font-mono mb-1">{order.orderNumber || order.id}</div>
                      <div className="text-sm text-gray-700 line-clamp-2">{order.description}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-800">
                        Warten auf Endabnahme
                      </span>
                    </td>
                    <td className="px-6 py-4 min-w-[350px]">
                      <EndabnahmeActions
                        onConfirm={async (note) => {
                          const updatedOrder = { ...order, status: 'completed', confirmationNote: note || '', confirmationDate: new Date() };
                          await fetch(`/api/orders/${order.id}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(updatedOrder)
                          });
                          // Nach erfolgreichem Abschluss: Aufträge neu laden
                          if (typeof window !== 'undefined') window.location.reload();
                        }}
                        onRequestRevision={async (revisionComment) => {
                          if (!revisionComment) return;
                          // Sende nur die notwendigen Felder für Nacharbeitskommentare
                          const requestBody = {
                            status: 'rework',
                            revisionComment: revisionComment, // Das Backend erwartet revisionComment
                            userId: state.currentUser?.id,
                            userName: state.currentUser?.name,
                            updatedAt: new Date(),
                          };
                          
                          console.log('ClientDashboard: Sending rework request:', requestBody);
                          
                          await fetch(`/api/orders/${order.id}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(requestBody)
                          });
                          // Nach erfolgreichem Abschluss: Aufträge neu laden
                          if (typeof window !== 'undefined') window.location.reload();
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}