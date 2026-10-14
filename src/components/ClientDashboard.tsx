import OrderProgress from './OrderProgress';
import { useState, useEffect } from 'react';
import { Plus, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { ColumnConfigDropdown, useTableColumns, OrderedTableRow } from './ColumnConfigDropdown';
import { orderColumns } from './WorkshopDashboard';
import OrderForm from './OrderForm';
import { Order } from '../types';
import { useTranslation } from 'react-i18next';

const clientColumns = orderColumns.filter(column =>
  ['orderNumber', 'projectName', 'title', 'createdAt', 'deadline', 'status', 'actions'].includes(column.id)
);

export default function ClientDashboard() {
  const { isVisible } = useTableColumns('client');
  const { state, dispatch } = useApp();
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [orders, setOrders] = useState<Order[]>(state.orders);
  const [orderSortConfig, setOrderSortConfig] = useState<{ key: keyof Order | 'orderNumber', direction: 'asc' | 'desc' }>({
    key: 'orderNumber', 
    direction: 'desc' 
  });

  const [waitingSortConfig, setWaitingSortConfig] = useState<typeof orderSortConfig>({ key: 'orderNumber', direction: 'desc' });
  const handleSort = (table: 'waiting' | 'orders', key: keyof Order) => {
    const setSortConfig = table === 'waiting' ? setWaitingSortConfig : setOrderSortConfig;
    setSortConfig(current => ({ key, direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc' }));
  };

  const getSortedOrders = (ordersToSort: Order[], sortConfig: typeof orderSortConfig) => {
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

  const waitingOrders = getSortedOrders(userOrders.filter(order => order.status === 'waiting_confirmation'), waitingSortConfig);
  // Aufträge zur Überarbeitung oder Nacharbeit werden im Dashboard angezeigt
  const otherOrders = getSortedOrders(userOrders.filter(order => order.status !== 'waiting_confirmation'), orderSortConfig);

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
            <ColumnConfigDropdown columns={clientColumns} tableId="client" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full" style={{ overflowAnchor: 'none' }}>
              <thead className="bg-gray-50">
                <OrderedTableRow tableId="client">
                  {isVisible('orderNumber') && (
                    <th onClick={() => handleSort('waiting', 'orderNumber')} data-column="orderNumber" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Auftragsnummer</th>
                  )}
                  {isVisible('projectName') && (
                    <th onClick={() => handleSort('waiting', 'projectName')} data-column="projectName" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Projektname</th>
                  )}
                  {isVisible('title') && (
                    <th onClick={() => handleSort('waiting', 'title')} data-column="title" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Auftragstitel</th>
                  )}
                  {isVisible('createdAt') && (
                    <th onClick={() => handleSort('waiting', 'createdAt')} data-column="createdAt" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Erstellt</th>
                  )}
                  {isVisible('status') && (
                    <th onClick={() => handleSort('waiting', 'status')} data-column="status" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  )}

                </OrderedTableRow>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {waitingOrders.map((order) => (
                  <OrderedTableRow tableId="client"
                    key={order.id} 
                    className="hover:bg-gray-50 bg-yellow-50/50 cursor-pointer"
                    onClick={() => navigate(`/orders/${order.orderNumber || order.id}`)}
                  >
                    {isVisible('orderNumber') && (
                        <td data-column="orderNumber" className="px-6 py-4">
                          <div className="text-xs text-gray-500 font-mono mb-1">{order.orderNumber || order.id}</div>
                        </td>
                      )}
                      {isVisible('projectName') && (
                        <td data-column="projectName" className="px-6 py-4">
                          <div className="text-sm font-medium text-gray-900">{order.projectName || '-'}</div>
                        </td>
                      )}
                      {isVisible('title') && (
                        <td data-column="title" className="px-6 py-4">
                          <div className="text-sm font-medium text-gray-900">{order.title}</div>
                          <div className="text-sm text-gray-700 line-clamp-2 mt-1">{order.description}</div>
                        </td>
                      )}
                    {isVisible('createdAt') && (
                        <td data-column="createdAt" className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{new Date(order.createdAt).toLocaleDateString('de-DE')}</div>
                        </td>
                      )}
                    {isVisible('status') && (
                        <td data-column="status" className="px-6 py-4 whitespace-nowrap">
                          <OrderProgress compact status={order.status} subTasks={order.subTasks} />
                        </td>
                      )}

                  </OrderedTableRow>
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
              <ColumnConfigDropdown columns={clientColumns} tableId="client" />
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
            <table className="w-full" style={{ overflowAnchor: 'none' }}>
              <thead className="bg-gray-50">
                <OrderedTableRow tableId="client">
                  {isVisible('orderNumber') && (
                  <th data-column="orderNumber" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('orders', 'orderNumber')}>
                    <div className="flex items-center space-x-1">
                      <span>{t('dashboard.columns.orderNumber', 'Auftragsnummer')}</span>
                      {orderSortConfig.key === 'orderNumber' ? (orderSortConfig.direction === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />) : <ArrowUpDown className="w-4 h-4 opacity-0 group-hover:opacity-100" />}
                    </div>
                  </th>
                  )}
                  {isVisible('projectName') && (
                    <th onClick={() => handleSort('orders', 'projectName')} data-column="projectName" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('dashboard.columns.projectName', 'Projektname')}</th>
                  )}
                  {isVisible('title') && (
                    <th onClick={() => handleSort('orders', 'title')} data-column="title" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('dashboard.columns.title', 'Auftragstitel')}</th>
                  )}
                  {isVisible('createdAt') && (
                    <th data-column="createdAt" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('orders', 'createdAt')}>
                    <div className="flex items-center space-x-1">
                      <span>{t('dashboard.columns.createdAt', 'Erstellt')}</span>
                      {orderSortConfig.key === 'createdAt' ? (orderSortConfig.direction === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />) : <ArrowUpDown className="w-4 h-4 opacity-0 group-hover:opacity-100" />}
                    </div>
                  </th>
                  )}
                  {isVisible('deadline') && (
                    <th data-column="deadline" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('orders', 'deadline')}>
                    <div className="flex items-center space-x-1">
                      <span>{t('dashboard.columns.deadline', 'Deadline')}</span>
                      {orderSortConfig.key === 'deadline' ? (orderSortConfig.direction === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />) : <ArrowUpDown className="w-4 h-4 opacity-0 group-hover:opacity-100" />}
                    </div>
                  </th>
                  )}
                  {isVisible('status') && (
                    <th data-column="status" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('orders', 'status')}>
                    <div className="flex items-center space-x-1">
                      <span>{t('common.status', 'Status')}</span>
                      {orderSortConfig.key === 'status' ? (orderSortConfig.direction === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />) : <ArrowUpDown className="w-4 h-4 opacity-0 group-hover:opacity-100" />}
                    </div>
                  </th>
                  )}

                </OrderedTableRow>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {otherOrders.map((order) => (
                  <OrderedTableRow tableId="client"
                    key={order.id} 
                    className={`hover:bg-gray-50 cursor-pointer ${order.status === 'revision' ? 'bg-orange-50' : ''}`}
                    onClick={() => navigate(`/orders/${order.orderNumber || order.id}`)}
                  >
                    {isVisible('orderNumber') && (
                        <td data-column="orderNumber" className="px-6 py-4 whitespace-nowrap">
                          <div className="text-xs text-gray-500 font-mono">{order.orderNumber || order.id}</div>
                        </td>
                      )}
                      {isVisible('projectName') && (
                        <td data-column="projectName" className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{order.projectName || '-'}</div>
                        </td>
                      )}
                      {isVisible('title') && (
                        <td data-column="title" className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{order.title}</div>
                        </td>
                      )}
                    {isVisible('createdAt') && (
                        <td data-column="createdAt" className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{new Date(order.createdAt).toLocaleDateString('de-DE')}</div>
                        </td>
                      )}
                    {isVisible('deadline') && (
                        <td data-column="deadline" className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{new Date(order.deadline).toLocaleDateString('de-DE')}</div>
                          <div className="text-xs text-gray-500">{order.costCenter}</div>
                        </td>
                      )}
                    {isVisible('status') && (
                        <td data-column="status" className="px-6 py-4 whitespace-nowrap">
                          <OrderProgress compact status={order.status} subTasks={order.subTasks} />
                        </td>
                      )}

                  </OrderedTableRow>
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
