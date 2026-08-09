import { useState, useEffect } from 'react';
import { Plus, Clock, Edit2, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { ColumnConfigDropdown, useTableColumns } from './ColumnConfigDropdown';
import { orderColumns } from './WorkshopDashboard';
import OrderForm from './OrderForm';
import EndabnahmeActions from './EndabnahmeActions';
import { Order } from '../types';
import { useTranslation } from 'react-i18next';

export default function ClientDashboard() {
  const { isVisible } = useTableColumns('client');
  const { state, dispatch } = useApp();
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
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
      } else if (sortConfig.key === 'createdAt') {
        aVal = new Date(a.createdAt).getTime();
        bVal = new Date(b.createdAt).getTime();
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
        navigate(`/orders/${orderToOpen.orderNumber || orderToOpen.id}`);
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
      case 'pending': return t('dashboard.pending', 'Ausstehend');
      case 'accepted': return t('dashboard.accepted', 'Angenommen');
      case 'in_progress': return t('dashboard.in_progress', 'In Bearbeitung');
      case 'revision': return t('dashboard.revision', 'Überarbeitung');
      case 'rework': return t('dashboard.rework', 'Nacharbeit');
      case 'completed': return t('dashboard.completed', 'Abgeschlossen');
      default: return status;
    }
  };

  if (editingOrder) {
    return <OrderForm 
      mode="edit"
      initialData={editingOrder} 
      onClose={() => {
        setEditingOrder(null);
        fetchOrders();
      }} 
    />;
  }


  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
      {waitingOrders.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border mb-8">
          <div className="p-4 border-b flex justify-between items-center">
            <h3 className="text-lg font-bold text-gray-900">{t('client.waiting_confirmation', 'Aufträge zur Endabnahme')}</h3>
            <ColumnConfigDropdown columns={orderColumns} tableId="client" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  {isVisible('orderNumber') && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Auftragsnummer</th>
                  )}
                  {isVisible('projectName') && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Projektname</th>
                  )}
                  {isVisible('title') && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Auftragstitel</th>
                  )}
                  {isVisible('createdAt') && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Erstellt</th>
                  )}
                  {isVisible('status') && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  )}
                  {isVisible('actions') && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[300px]">Aktionen</th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {waitingOrders.map((order) => (
                  <tr 
                    key={order.id} 
                    className="hover:bg-gray-50 bg-yellow-50/50 cursor-pointer"
                    onClick={() => navigate(`/orders/${order.orderNumber || order.id}`)}
                  >
                    {isVisible('orderNumber') && (
                        <td className="px-6 py-4">
                          <div className="text-xs text-gray-500 font-mono mb-1">{order.orderNumber || order.id}</div>
                        </td>
                      )}
                      {isVisible('projectName') && (
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-gray-900">{order.projectName || '-'}</div>
                        </td>
                      )}
                      {isVisible('title') && (
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-gray-900">{order.title}</div>
                          <div className="text-sm text-gray-700 line-clamp-2 mt-1">{order.description}</div>
                        </td>
                      )}
                    {isVisible('createdAt') && (
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{new Date(order.createdAt).toLocaleDateString('de-DE')}</div>
                        </td>
                      )}
                    {isVisible('status') && (
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-800">
                            {t('client.waiting_status', 'Warten auf Endabnahme')}
                          </span>
                        </td>
                      )}
                    {isVisible('actions') && (
                        <td className="px-6 py-4 min-w-[350px]" onClick={(e) => e.stopPropagation()}>
                      <EndabnahmeActions
                        onConfirm={async (note) => {
                          const updatedOrder = { ...order, status: 'completed', confirmationNote: note || '', confirmationDate: new Date() };
                          await fetch(`/api/orders/${order.id}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(updatedOrder)
                          });
                          if (typeof window !== 'undefined') window.location.reload();
                        }}
                        onRequestRevision={async (revisionComment) => {
                          if (!revisionComment) return;
                          const requestBody = {
                            status: 'rework',
                            revisionComment: revisionComment,
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
                          if (typeof window !== 'undefined') window.location.reload();
                        }}
                      />
                    </td>
                      )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Aktuelle Aufträge */}
      {otherOrders.length > 0 ? (
        <div className="bg-white rounded-lg shadow-sm border mb-8">
          <div className="p-4 border-b flex justify-between items-center flex-wrap gap-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{t('dashboard.my_orders', 'Meine Aufträge')}</h2>
              <p className="text-sm text-gray-500 mt-1">{t('client.subtitle', 'Verwalten Sie Ihre Werkstattaufträge')}</p>
            </div>
            <div className="flex items-center gap-3">
              <ColumnConfigDropdown columns={orderColumns} tableId="client" />
              <button
                onClick={() => navigate('/orders/new')}
                className="bg-blue-600 text-white px-3 py-1.5 text-sm rounded-lg hover:bg-blue-700 transition-colors flex items-center"
              >
                <Plus className="w-4 h-4 mr-1.5" />
                {t('dashboard.new_order', 'Neuer Auftrag')}
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  {isVisible('orderNumber') && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('orderNumber')}>
                    <div className="flex items-center space-x-1">
                      <span>{t('dashboard.columns.orderNumber', 'Auftragsnummer')}</span>
                      {sortConfig.key === 'orderNumber' ? (sortConfig.direction === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />) : <ArrowUpDown className="w-4 h-4 opacity-0 group-hover:opacity-100" />}
                    </div>
                  </th>
                  )}
                  {isVisible('projectName') && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('dashboard.columns.projectName', 'Projektname')}</th>
                  )}
                  {isVisible('title') && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('dashboard.columns.title', 'Auftragstitel')}</th>
                  )}
                  {isVisible('createdAt') && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('createdAt')}>
                    <div className="flex items-center space-x-1">
                      <span>{t('dashboard.columns.createdAt', 'Erstellt')}</span>
                      {sortConfig.key === 'createdAt' ? (sortConfig.direction === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />) : <ArrowUpDown className="w-4 h-4 opacity-0 group-hover:opacity-100" />}
                    </div>
                  </th>
                  )}
                  {isVisible('deadline') && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('deadline')}>
                    <div className="flex items-center space-x-1">
                      <span>{t('dashboard.columns.deadline', 'Deadline')}</span>
                      {sortConfig.key === 'deadline' ? (sortConfig.direction === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />) : <ArrowUpDown className="w-4 h-4 opacity-0 group-hover:opacity-100" />}
                    </div>
                  </th>
                  )}
                  {isVisible('status') && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('status')}>
                    <div className="flex items-center space-x-1">
                      <span>{t('common.status', 'Status')}</span>
                      {sortConfig.key === 'status' ? (sortConfig.direction === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />) : <ArrowUpDown className="w-4 h-4 opacity-0 group-hover:opacity-100" />}
                    </div>
                  </th>
                  )}
                  {isVisible('time') && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('dashboard.columns.time', 'Geschätzt')}</th>
                  )}
                  {isVisible('actions') && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('common.actions', 'Aktionen')}</th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {otherOrders.map((order) => (
                  <tr 
                    key={order.id} 
                    className={`hover:bg-gray-50 cursor-pointer ${order.status === 'revision' ? 'bg-orange-50' : ''}`}
                    onClick={() => navigate(`/orders/${order.orderNumber || order.id}`)}
                  >
                    {isVisible('orderNumber') && (
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-xs text-gray-500 font-mono">{order.orderNumber || order.id}</div>
                        </td>
                      )}
                      {isVisible('projectName') && (
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{order.projectName || '-'}</div>
                        </td>
                      )}
                      {isVisible('title') && (
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{order.title}</div>
                        </td>
                      )}
                    {isVisible('createdAt') && (
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{new Date(order.createdAt).toLocaleDateString('de-DE')}</div>
                        </td>
                      )}
                    {isVisible('deadline') && (
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{new Date(order.deadline).toLocaleDateString('de-DE')}</div>
                          <div className="text-xs text-gray-500">{order.costCenter}</div>
                        </td>
                      )}
                    {isVisible('status') && (
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(order.status)}`}>
                            {getStatusText(order.status)}
                          </span>
                          {order.status === 'revision' && (
                            <div className="mt-1 text-xs text-orange-600 font-medium">{t('client.pleaseRevise', 'Bitte überarbeiten')}</div>
                          )}
                        </td>
                      )}
                    {isVisible('time') && (
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center text-sm text-gray-900">
                            <Clock className="w-4 h-4 text-gray-400 mr-1" />
                            {order.estimatedHours}h
                          </div>
                        </td>
                      )}
                    {isVisible('actions') && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-3">

                        {order.status !== 'completed' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/orders/${order.orderNumber || order.id}/edit`);
                            }}
                            className="text-orange-600 hover:text-orange-800 flex items-center"
                          >
                            <Edit2 className="w-4 h-4 mr-1" />
                            {t('common.edit', 'Bearbeiten')}
                          </button>
                        )}
                      </div>
                    </td>
                      )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="mb-6 flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{t('dashboard.my_orders', 'Meine Aufträge')}</h2>
            <p className="text-gray-500 mt-4">{t('dashboard.noItems', 'Keine Aufträge in dieser Ansicht.')}</p>
          </div>
          <button
            onClick={() => navigate('/orders/new')}
            className="bg-blue-600 text-white px-3 py-1.5 text-sm rounded-lg hover:bg-blue-700 transition-colors flex items-center"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            {t('dashboard.new_order', 'Neuer Auftrag')}
          </button>
        </div>
      )}
    </div>
  );
}