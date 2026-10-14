import OrderProgress from './OrderProgress';
import { useState, useEffect } from 'react';
import { Clock, User, Filter, Search, QrCode, Plus, ArrowUpDown, ArrowUp, ArrowDown, Download } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useApp } from '../context/AppContext';
import QRCodeScanner from './QRCodeScanner';
import { ColumnConfigDropdown, useTableColumns, OrderedTableRow } from './ColumnConfigDropdown';
import { Order } from '../types';

export const orderColumns = [
  { id: 'orderNumber', label: 'Auftragsnummer' },
  { id: 'projectName', label: 'Projektname' },
  { id: 'title', label: 'Auftragstitel' },
  { id: 'clientName', label: 'Auftraggeber' },
  { id: 'createdAt', label: 'Erstellt' },
  { id: 'deadline', label: 'Deadline' },
  { id: 'status', label: 'Status' },
  { id: 'priority', label: 'Priorität' },
  { id: 'assignedTo', label: 'Zugewiesen' },
  { id: 'time', label: 'Zeit' }
];

const acceptanceColumns = [
  ...orderColumns.filter(column => ['orderNumber', 'projectName', 'title', 'clientName'].includes(column.id)),
  { id: 'waitingConfirmationSince', label: 'Freigegeben am' },
  { id: 'deadline', label: 'Deadline' }
];

type SortConfig = { key: keyof Order; direction: 'asc' | 'desc' };
type DashboardTable = 'fertigung' | 'service' | 'acceptance';
const defaultSort: SortConfig = { key: 'orderNumber', direction: 'desc' };

export default function WorkshopDashboard() {
  const { state, dispatch } = useApp();
  const { t } = useTranslation();
  const { isVisible } = useTableColumns('workshop');
  const location = useLocation();
  const navigate = useNavigate();
  const preferencesKey = `workshopDashboardPreferences:${state.currentUser?.id || 'anonymous'}`;
  const [dashboardPreferences, setDashboardPreferences] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(preferencesKey) || '{}');
      const savedStatusFilter = typeof saved.statusFilter === 'string' ? saved.statusFilter : 'all';
      return {
        statusFilter: ['waiting_confirmation', 'all_with_waiting'].includes(savedStatusFilter) ? 'all' : savedStatusFilter,
        searchTerm: typeof saved.searchTerm === 'string' ? saved.searchTerm : '',
        viewMode: saved.viewMode === 'assigned' ? 'assigned' : 'all',
        sortConfigs: Object.fromEntries(['fertigung', 'service', 'acceptance'].map(tableId => {
          const config = saved.sortConfigs?.[tableId] || saved.sortConfig;
          return [tableId, config?.key && ['asc', 'desc'].includes(config.direction) ? config : defaultSort];
        })) as Record<DashboardTable, SortConfig>
      };
    } catch {
      return { statusFilter: 'all', searchTerm: '', viewMode: 'all', sortConfigs: { fertigung: defaultSort, service: defaultSort, acceptance: defaultSort } };
    }
  });
  const { statusFilter, searchTerm, viewMode, sortConfigs } = dashboardPreferences;
  const setStatusFilter = (value: string) => setDashboardPreferences(current => ({ ...current, statusFilter: value }));
  const setSearchTerm = (value: string) => setDashboardPreferences(current => ({ ...current, searchTerm: value }));
  const setViewMode = (value: 'all' | 'assigned') => setDashboardPreferences(current => ({ ...current, viewMode: value }));
  const [orders, setOrders] = useState<Order[]>(Array.isArray(state.orders) ? state.orders : []);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  useEffect(() => {
    try {
      localStorage.setItem(preferencesKey, JSON.stringify(dashboardPreferences));
    } catch (error) {
      console.warn('Dashboard-Auswahl konnte nicht gespeichert werden:', error);
    }
  }, [preferencesKey, dashboardPreferences]);

  const handleSort = (tableId: DashboardTable, key: keyof Order) => {
    setDashboardPreferences(current => ({ ...current, sortConfigs: {
      ...current.sortConfigs,
      [tableId]: {
        key,
        direction: current.sortConfigs[tableId].key === key && current.sortConfigs[tableId].direction === 'asc' ? 'desc' : 'asc'
      }
    }}));
  };
  const fetchOrders = async () => {
    try {
      const viewerRole = state.currentUser?.role || 'workshop';
      const res = await fetch(`/api/orders?viewerRole=${encodeURIComponent(viewerRole)}`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();
      // Stelle sicher, dass data ein Array ist
      if (Array.isArray(data)) {
        setOrders(data);
        if (dispatch) dispatch({ type: 'LOAD_ORDERS', payload: data });
      } else {
        console.error('API returned non-array data:', data);
        setOrders([]); // Fallback zu leerem Array
      }
    } catch (error) {
      console.error('Fehler beim Laden der Aufträge:', error);
      setOrders([]); // Fallback zu leerem Array bei Fehler
      if (dispatch) {
        dispatch({
          type: 'SHOW_NOTIFICATION',
          payload: { message: 'Fehler beim Laden der Aufträge', type: 'error' }
        });
      }
    }
  };

  // Aufträge initial laden
  useEffect(() => {
    fetchOrders();
  }, [state.currentUser?.role]); // Nur neu laden wenn sich die Rolle ändert

  // State mit lokalem Component-State synchronisieren
  useEffect(() => {
    setOrders(Array.isArray(state.orders) ? state.orders : []);
  }, [state.orders]);

  // QR-Code-Scanner Handler
  const handleBarcodeScanned = async (code: string) => {
    try {
      console.log('QR-Code gescannt:', code);
      
      // Suche nach Auftrag mit diesem Code
      const viewerRole = state.currentUser?.role || 'workshop';
      const response = await fetch(`/api/orders/barcode/${encodeURIComponent(code)}?viewerRole=${encodeURIComponent(viewerRole)}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          dispatch({ 
            type: 'SHOW_NOTIFICATION', 
            payload: { message: `Kein Auftrag mit Code "${code}" gefunden.`, type: 'error' } 
          });
        } else {
          throw new Error('Fehler beim Suchen des Auftrags');
        }
        return;
      }

      const order = await response.json();
      console.log('Auftrag gefunden:', order);
      
      // Schließe Scanner und öffne Auftrag
      setShowBarcodeScanner(false);
      navigate(`/orders/${order.orderNumber || order.id}`);
      
      dispatch({ 
        type: 'SHOW_NOTIFICATION', 
        payload: { message: `Auftrag "${order.orderNumber || order.id}" geöffnet.`, type: 'success' } 
      });
      
    } catch (error) {
      console.error('Fehler beim QR-Code-Scan:', error);
      dispatch({ 
        type: 'SHOW_NOTIFICATION', 
        payload: { message: 'Fehler beim Suchen des Auftrags.', type: 'error' } 
      });
    }
  };

  useEffect(() => {
    setOrders(state.orders);
    
    // Handle opening specific order from QR code redirect
    const locationState = location.state as { openOrderId?: string } | null;
    if (locationState?.openOrderId && orders.length > 0) {
      const orderToOpen = orders.find(order => 
        order.id === locationState.openOrderId || 
        order.orderNumber === locationState.openOrderId
      );
      
      if (orderToOpen) {
        navigate(`/orders/${orderToOpen.orderNumber || orderToOpen.id}`);
        dispatch({ 
          type: 'SHOW_NOTIFICATION', 
          payload: { message: `Auftrag "${orderToOpen.orderNumber || orderToOpen.id}" über QR-Code geöffnet.`, type: 'success' } 
        });
      }
    }
  }, [state.orders, location.state, orders, dispatch]);

  // Filter orders based on user role and view mode
  const getFilteredOrders = () => {
    // Stelle sicher, dass orders ein Array ist
    if (!Array.isArray(orders)) {
      console.warn('orders is not an array:', orders);
      return [];
    }
    
    let filtered = orders.filter(order =>
      typeof order.status === 'string' && order.status.trim().toLowerCase() !== 'archived'
    );
    if (viewMode === 'assigned' && ['workshop', 'employee', 'manager'].includes(state.currentUser?.role || '')) {
      filtered = filtered.filter(order =>
        order.assignedTo === state.currentUser?.id ||
        (Array.isArray(order.subTasks) && order.subTasks.some(subTask => subTask.assignedTo === state.currentUser?.id))
      );
    }
    return filtered;
  };

  const activeOrders = getFilteredOrders();
  
  // Sort orders by selected criteria
  const compareOrders = (a: Order, b: Order, sortConfig: SortConfig) => {
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
      } else if (sortConfig.key === 'createdAt') {
        aVal = new Date(a.createdAt).getTime();
        bVal = new Date(b.createdAt).getTime();
      } else if (['deadline', 'waitingConfirmationSince'].includes(sortConfig.key)) {
        aVal = new Date(a[sortConfig.key as 'deadline'] || 0).getTime();
        bVal = new Date(b[sortConfig.key as 'deadline'] || 0).getTime();
      } else if (sortConfig.key === 'status') {
        aVal = a.status || '';
        bVal = b.status || '';
      } else if (sortConfig.key === 'priority') {
        const priorityScore = { high: 3, medium: 2, low: 1 };
        aVal = priorityScore[a.priority] || 0;
        bVal = priorityScore[b.priority] || 0;
      }

      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
  };

  const matchesSearch = (order: Order) => {
    const normalizedSearch = searchTerm.toLowerCase().replace(/[-0]/g, '');
    const normalizedOrderNumber = (order.orderNumber || '').toLowerCase().replace(/[-0]/g, '');
    return order.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (order.projectName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      normalizedOrderNumber.includes(normalizedSearch) ||
      order.clientName.toLowerCase().includes(searchTerm.toLowerCase());
  };

  const filteredOrders = activeOrders.filter(order => {
    const matchesStatus = order.status !== 'waiting_confirmation' &&
      (statusFilter === 'all' || order.status === statusFilter ||
        (statusFilter === 'overdue' && isOverdue(order.deadline)));
    return matchesStatus && matchesSearch(order);
  });
  const waitingConfirmationOrders = activeOrders.filter(order =>
    order.status === 'waiting_confirmation' && matchesSearch(order)
  ).sort((a, b) => compareOrders(a, b, sortConfigs.acceptance));

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getPriorityText = (priority: string) => {
    switch (priority) {
      case 'high': return t('dashboard.priority_levels.high', 'Hoch');
      case 'medium': return t('dashboard.priority_levels.medium', 'Mittel');
      case 'low': return t('dashboard.priority_levels.low', 'Niedrig');
      default: return priority;
    }
  };

  function isOverdue(deadline: Date) {
    return new Date(deadline) < new Date(new Date().setHours(0,0,0,0));
  }

  // Create a flattened list for display with subtasks indented
  const createDisplayList = () => {
    const displayItems: Array<{
      type: 'order' | 'subtask';
      order: Order;
      subTask?: any;
      isIndented?: boolean;
    }> = [];

    filteredOrders.forEach(order => {
      // Sicherstellen, dass order und order.subTasks definiert sind
      if (!order) return;
      displayItems.push({ type: 'order', order });
      
      // Add subtasks for this order if user has access
      if (Array.isArray(order.subTasks) && (state.currentUser?.role === 'admin' || 
          order.assignedTo === state.currentUser?.id ||
          order.subTasks.some(st => st.assignedTo === state.currentUser?.id))) {
        
        order.subTasks.forEach(subTask => {
          if (state.currentUser?.role === 'admin' || 
              subTask.assignedTo === state.currentUser?.id ||
              order.assignedTo === state.currentUser?.id) {
            displayItems.push({ 
              type: 'subtask', 
              order, 
              subTask, 
              isIndented: true 
            });
          }
        });
      }
    });

    return displayItems;
  };

  const displayItems = createDisplayList();

  // Listen nach Auftragstyp trennen
  const fertigungOrders = displayItems.filter(item => item.type === 'order' && item.order && item.order.orderType === 'fertigung').sort((a, b) => compareOrders(a.order, b.order, sortConfigs.fertigung));
  const serviceOrders = displayItems.filter(item => item.type === 'order' && item.order && item.order.orderType === 'service').sort((a, b) => compareOrders(a.order, b.order, sortConfigs.service));

  // Handle opening order from QR code URL
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const orderId = searchParams.get('orderId');
    const barcode = searchParams.get('barcode');

    if (orderId) {
      const order = orders.find(order => order.id === orderId);
      if (order) {
        navigate(`/orders/${order.orderNumber || order.id}`);
        dispatch({ 
          type: 'SHOW_NOTIFICATION', 
          payload: { message: `Auftrag "${order.orderNumber || order.id}" geöffnet.`, type: 'success' } 
        });
      }
    } else if (barcode) {
      handleBarcodeScanned(barcode);
    }
  }, [location.search, orders, handleBarcodeScanned, dispatch]);


  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{t('dashboard.title', 'Werkstattaufträge')}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="relative w-full min-w-48 md:w-64">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder={t('common.search', 'Suchen...')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400 hidden sm:block" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            >
              <option value="all">Arbeitsliste</option>
              <option value="overdue">{t('dashboard.overdue', 'Überfällig')}</option>
              <option value="pending">{t('dashboard.pending', 'Ausstehend')}</option>
              <option value="accepted">{t('dashboard.accepted', 'Angenommen')}</option>
              <option value="in_progress">{t('dashboard.in_progress', 'In Bearbeitung')}</option>
              <option value="revision">{t('dashboard.revision', 'Überarbeitung')}</option>
              <option value="rework">{t('dashboard.rework', 'Nacharbeit')}</option>
              <option value="completed">{t('dashboard.completed', 'Abgeschlossen')}</option>
            </select>
          </div>
          {state.currentUser?.role === 'manager' && (
            <div className="flex items-center gap-2 text-sm">
              <span className={viewMode === 'all' ? 'font-semibold text-blue-700' : 'text-gray-600'}>Verwaltung</span>
              <button
                type="button"
                role="switch"
                aria-label="Abarbeitung: nur eigene Aufträge"
                aria-checked={viewMode === 'assigned'}
                onClick={() => setViewMode(viewMode === 'all' ? 'assigned' : 'all')}
                className={`relative h-6 w-11 rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 ${viewMode === 'assigned' ? 'bg-blue-600' : 'bg-gray-400'}`}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${viewMode === 'assigned' ? 'left-0.5 translate-x-5' : 'left-0.5'}`} />
              </button>
              <span className={viewMode === 'assigned' ? 'font-semibold text-blue-700' : 'text-gray-600'}>Abarbeitung</span>
            </div>
          )}
          {['workshop', 'employee'].includes(state.currentUser?.role || '') && (
            <select
              value={viewMode}
              onChange={(e) => setViewMode(e.target.value as 'all' | 'assigned')}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            >
              <option value="all">{t('dashboard.all_orders', 'Alle Aufträge')}</option>
              <option value="assigned">{t('dashboard.my_orders', 'Meine Aufträge')}</option>
            </select>
          )}
          <button
            onClick={() => setShowBarcodeScanner(true)}
            className="bg-gray-100 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-200 transition-colors flex items-center text-sm"
            title="QR-Code-Scanner öffnen"
          >
            <QrCode className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">{t('dashboard.scan_qr', 'QR-Code scannen')}</span>
          </button>
          {['admin', 'manager'].includes(state.currentUser?.role || '') && (
            <button
              onClick={() => window.location.href = '/api/orders/export/csv'}
              className="bg-green-600 text-white px-3 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center text-sm"
              title="Daten exportieren (CSV)"
            >
              <Download className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">{t('common.exportCSV', 'Daten exportieren (CSV)')}</span>
            </button>
          )}
          {['admin', 'workshop', 'employee', 'manager'].includes(state.currentUser?.role || '') && (
            <button
              onClick={() => navigate('/orders/new')}
              className="bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center text-sm"
            >
              <Plus className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">{t('dashboard.new_order', 'Neuer Auftrag')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Fertigungsaufträge Tabelle */}
        <div className="bg-white rounded-lg shadow-sm border mb-6">
          <div className="p-4 border-b flex justify-between items-center">
            <h3 className="text-lg font-semibold text-gray-900">{t('dashboard.title', 'Fertigungsaufträge')}</h3>
            <ColumnConfigDropdown columns={orderColumns} tableId="workshop" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full" style={{ overflowAnchor: 'none' }}>
              <thead className="bg-gray-50">
                <OrderedTableRow tableId="workshop">
                  {isVisible('orderNumber') && (
                  <th data-column="orderNumber" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('fertigung', 'orderNumber')}>
                    <div className="flex items-center space-x-1">
                      <span>{t('dashboard.columns.orderNumber', 'Auftragsnummer')}</span>
                      {sortConfigs.fertigung.key === 'orderNumber' ? (sortConfigs.fertigung.direction === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />) : <ArrowUpDown className="w-4 h-4 opacity-0 group-hover:opacity-100" />}
                    </div>
                  </th>
                  )}
                  {isVisible('projectName') && (
                    <th onClick={() => handleSort('fertigung', 'projectName')} data-column="projectName" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('dashboard.columns.projectName', 'Projektname')}</th>
                  )}
                  {isVisible('title') && (
                    <th onClick={() => handleSort('fertigung', 'title')} data-column="title" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('dashboard.columns.title', 'Auftragstitel')}</th>
                  )}
                  {isVisible('clientName') && (
                  <th data-column="clientName" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('fertigung', 'clientName')}>
                    <div className="flex items-center space-x-1">
                      <span>{t('dashboard.columns.clientName', 'Auftraggeber')}</span>
                      {sortConfigs.fertigung.key === 'clientName' ? (sortConfigs.fertigung.direction === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />) : <ArrowUpDown className="w-4 h-4 opacity-0 group-hover:opacity-100" />}
                    </div>
                  </th>
                  )}
                  {isVisible('createdAt') && (
                  <th data-column="createdAt" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('fertigung', 'createdAt')}>
                    <div className="flex items-center space-x-1">
                      <span>{t('dashboard.columns.createdAt', 'Erstellt')}</span>
                      {sortConfigs.fertigung.key === 'createdAt' ? (sortConfigs.fertigung.direction === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />) : <ArrowUpDown className="w-4 h-4 opacity-0 group-hover:opacity-100" />}
                    </div>
                  </th>
                  )}
                  {isVisible('deadline') && (
                  <th data-column="deadline" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('fertigung', 'deadline')}>
                    <div className="flex items-center space-x-1">
                      <span>{t('dashboard.columns.deadline', 'Deadline')}</span>
                      {sortConfigs.fertigung.key === 'deadline' ? (sortConfigs.fertigung.direction === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />) : <ArrowUpDown className="w-4 h-4 opacity-0 group-hover:opacity-100" />}
                    </div>
                  </th>
                  )}
                  {isVisible('status') && (
                  <th data-column="status" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('fertigung', 'status')}>
                    <div className="flex items-center space-x-1">
                      <span>{t('dashboard.columns.status', 'Status')}</span>
                      {sortConfigs.fertigung.key === 'status' ? (sortConfigs.fertigung.direction === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />) : <ArrowUpDown className="w-4 h-4 opacity-0 group-hover:opacity-100" />}
                    </div>
                  </th>
                  )}
                  {isVisible('priority') && (
                  <th data-column="priority" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('fertigung', 'priority')}>
                    <div className="flex items-center space-x-1">
                      <span>{t('dashboard.columns.priority', 'Priorität')}</span>
                      {sortConfigs.fertigung.key === 'priority' ? (sortConfigs.fertigung.direction === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />) : <ArrowUpDown className="w-4 h-4 opacity-0 group-hover:opacity-100" />}
                    </div>
                  </th>
                  )}
                  {isVisible('assignedTo') && (
                  <th onClick={() => handleSort('fertigung', 'assignedTo')} data-column="assignedTo" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('dashboard.columns.assignedTo', 'Zugewiesen')}</th>
                  )}
                  {isVisible('time') && (
                  <th onClick={() => handleSort('fertigung', 'estimatedHours')} data-column="time" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('dashboard.columns.time', 'Zeit')}</th>
                  )}

                </OrderedTableRow>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {fertigungOrders.map((item) => {
                  const order = item.order;
                  return (
                    <OrderedTableRow tableId="workshop"
                      key={`order-${order.id}`} 
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => navigate(`/orders/${order.orderNumber || order.id}`)}
                    >
                      {isVisible('orderNumber') && (
                        <td data-column="orderNumber" className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900 font-mono">{order.orderNumber || order.id}</div>
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
                      {isVisible('clientName') && (
                        <td data-column="clientName" className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{order.clientName}</div>
                          <div className="text-sm text-gray-500">{order.costCenter}</div>
                        </td>
                      )}
                      {isVisible('createdAt') && (
                        <td data-column="createdAt" className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{new Date(order.createdAt).toLocaleDateString('de-DE')}</div>
                        </td>
                      )}
                      {isVisible('deadline') && (
                        <td data-column="deadline" className="px-6 py-4 whitespace-nowrap">
                          <div className={`text-sm ${isOverdue(order.deadline) ? 'text-red-600 font-bold' : (order.deadline && new Date(order.deadline).toDateString() === new Date().toDateString() ? 'text-orange-500 font-bold' : 'text-gray-900')}`}>
                            {new Date(order.deadline).toLocaleDateString('de-DE')}
                          </div>
                        </td>
                      )}
                      <td data-column="status" className="px-6 py-4 whitespace-nowrap">
                        <OrderProgress compact status={order.status} subTasks={order.subTasks} />
                      </td>
                      <td data-column="priority" className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs rounded-full ${getPriorityColor(order.priority)}`}>
                          {getPriorityText(order.priority)}
                        </span>
                      </td>
                      <td data-column="assignedTo" className="px-6 py-4 whitespace-nowrap">
                        {order.assignedTo ? (
                          <div className="flex items-center">
                            <User className="w-4 h-4 text-gray-400 mr-1" />
                            <span className="text-sm text-gray-900">
                              {state.workshopAccounts.find(acc => acc.id === order.assignedTo)?.name || 'Unbekannt'}
                            </span>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-500">Nicht zugewiesen</span>
                        )}
                      </td>
                      <td data-column="time" className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center text-sm text-gray-900">
                          <Clock className="w-4 h-4 text-gray-400 mr-1" />
                          {order.estimatedHours}h
                        </div>
                      </td>

                    </OrderedTableRow>
                  );
                })}
                {fertigungOrders.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-6 py-8 text-center text-gray-500">
                      {t('dashboard.no_items_found', 'Es wurden keine Elemente gefunden.')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      {/* Serviceaufträge Tabelle */}
        <div className="bg-white rounded-lg shadow-sm border mb-6">
          <div className="p-4 border-b flex justify-between items-center">
            <h3 className="text-lg font-semibold text-gray-900">{t('dashboard.service_orders', 'Serviceaufträge')}</h3>
            <ColumnConfigDropdown columns={orderColumns} tableId="workshop" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full" style={{ overflowAnchor: 'none' }}>
              <thead className="bg-gray-50">
                <OrderedTableRow tableId="workshop">
                  {isVisible('orderNumber') && (
                  <th data-column="orderNumber" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('service', 'orderNumber')}>
                    <div className="flex items-center space-x-1">
                      <span>Auftragsnummer</span>
                      {sortConfigs.service.key === 'orderNumber' ? (sortConfigs.service.direction === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />) : <ArrowUpDown className="w-4 h-4 opacity-0 group-hover:opacity-100" />}
                    </div>
                  </th>
                  )}
                  {isVisible('projectName') && (
                    <th onClick={() => handleSort('service', 'projectName')} data-column="projectName" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Projektname</th>
                  )}
                  {isVisible('title') && (
                    <th onClick={() => handleSort('service', 'title')} data-column="title" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Auftragstitel</th>
                  )}
                  {isVisible('clientName') && (
                  <th data-column="clientName" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('service', 'clientName')}>
                    <div className="flex items-center space-x-1">
                      <span>Auftraggeber</span>
                      {sortConfigs.service.key === 'clientName' ? (sortConfigs.service.direction === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />) : <ArrowUpDown className="w-4 h-4 opacity-0 group-hover:opacity-100" />}
                    </div>
                  </th>
                  )}
                  {isVisible('createdAt') && (
                  <th data-column="createdAt" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('service', 'createdAt')}>
                    <div className="flex items-center space-x-1">
                      <span>Erstellt</span>
                      {sortConfigs.service.key === 'createdAt' ? (sortConfigs.service.direction === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />) : <ArrowUpDown className="w-4 h-4 opacity-0 group-hover:opacity-100" />}
                    </div>
                  </th>
                  )}
                  {isVisible('deadline') && (
                  <th data-column="deadline" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('service', 'deadline')}>
                    <div className="flex items-center space-x-1">
                      <span>Deadline</span>
                      {sortConfigs.service.key === 'deadline' ? (sortConfigs.service.direction === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />) : <ArrowUpDown className="w-4 h-4 opacity-0 group-hover:opacity-100" />}
                    </div>
                  </th>
                  )}
                  {isVisible('status') && (
                  <th data-column="status" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('service', 'status')}>
                    <div className="flex items-center space-x-1">
                      <span>Status</span>
                      {sortConfigs.service.key === 'status' ? (sortConfigs.service.direction === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />) : <ArrowUpDown className="w-4 h-4 opacity-0 group-hover:opacity-100" />}
                    </div>
                  </th>
                  )}
                  {isVisible('priority') && (
                  <th data-column="priority" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('service', 'priority')}>
                    <div className="flex items-center space-x-1">
                      <span>Priorität</span>
                      {sortConfigs.service.key === 'priority' ? (sortConfigs.service.direction === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />) : <ArrowUpDown className="w-4 h-4 opacity-0 group-hover:opacity-100" />}
                    </div>
                  </th>
                  )}
                  {isVisible('assignedTo') && (
                  <th onClick={() => handleSort('service', 'assignedTo')} data-column="assignedTo" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Zugewiesen</th>
                  )}
                  {isVisible('time') && (
                  <th onClick={() => handleSort('service', 'estimatedHours')} data-column="time" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Zeit</th>
                  )}

                </OrderedTableRow>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {serviceOrders.map((item) => {
                  const order = item.order;
                  return (
                    <OrderedTableRow tableId="workshop"
                      key={`order-${order.id}`} 
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => navigate(`/orders/${order.orderNumber || order.id}`)}
                    >
                      {isVisible('orderNumber') && (
                        <td data-column="orderNumber" className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900 font-mono">{order.orderNumber || order.id}</div>
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
                      {isVisible('clientName') && (
                        <td data-column="clientName" className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{order.clientName}</div>
                          <div className="text-sm text-gray-500">{order.costCenter}</div>
                        </td>
                      )}
                      {isVisible('createdAt') && (
                        <td data-column="createdAt" className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{new Date(order.createdAt).toLocaleDateString('de-DE')}</div>
                        </td>
                      )}
                      {isVisible('deadline') && (
                        <td data-column="deadline" className="px-6 py-4 whitespace-nowrap">
                          <div className={`text-sm ${isOverdue(order.deadline) ? 'text-red-600 font-bold' : (order.deadline && new Date(order.deadline).toDateString() === new Date().toDateString() ? 'text-orange-500 font-bold' : 'text-gray-900')}`}>
                            {new Date(order.deadline).toLocaleDateString('de-DE')}
                          </div>
                        </td>
                      )}
                      <td data-column="status" className="px-6 py-4 whitespace-nowrap">
                        <OrderProgress compact status={order.status} subTasks={order.subTasks} />
                      </td>
                      <td data-column="priority" className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs rounded-full ${getPriorityColor(order.priority)}`}>
                          {getPriorityText(order.priority)}
                        </span>
                      </td>
                      <td data-column="assignedTo" className="px-6 py-4 whitespace-nowrap">
                        {order.assignedTo ? (
                          <div className="flex items-center">
                            <User className="w-4 h-4 text-gray-400 mr-1" />
                            <span className="text-sm text-gray-900">
                              {state.workshopAccounts.find(acc => acc.id === order.assignedTo)?.name || 'Unbekannt'}
                            </span>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-500">Nicht zugewiesen</span>
                        )}
                      </td>
                      <td data-column="time" className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center text-sm text-gray-900">
                          <Clock className="w-4 h-4 text-gray-400 mr-1" />
                          {order.estimatedHours}h
                        </div>
                      </td>

                    </OrderedTableRow>
                  );
                })}
                {serviceOrders.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-6 py-8 text-center text-gray-500">
                      {t('dashboard.no_items_found', 'Es wurden keine Elemente gefunden.')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      {/* Aufträge zur Endabnahme */}
      <div className="mb-6 rounded-lg border bg-white shadow-sm">
        <div className="border-b p-4 flex justify-between items-center">
          <h3 className="text-lg font-semibold text-gray-900">Aufträge zur Abnahme</h3>
          <ColumnConfigDropdown columns={acceptanceColumns} tableId="workshopAcceptance" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full" style={{ overflowAnchor: 'none' }}>
            <thead className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              <OrderedTableRow tableId="workshopAcceptance">
                <th onClick={() => handleSort('acceptance', 'orderNumber')} data-column="orderNumber" scope="col" className="px-6 py-3">Auftragsnummer</th>
                <th onClick={() => handleSort('acceptance', 'projectName')} data-column="projectName" scope="col" className="px-6 py-3">Projektname</th>
                <th onClick={() => handleSort('acceptance', 'title')} data-column="title" scope="col" className="px-6 py-3">Auftragstitel</th>
                <th onClick={() => handleSort('acceptance', 'clientName')} data-column="clientName" scope="col" className="px-6 py-3">Auftraggeber</th>
                <th onClick={() => handleSort('acceptance', 'waitingConfirmationSince')} data-column="waitingConfirmationSince" scope="col" className="px-6 py-3">Freigegeben am</th>
                <th onClick={() => handleSort('acceptance', 'deadline')} data-column="deadline" scope="col" className="px-6 py-3">Deadline</th>

              </OrderedTableRow>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {waitingConfirmationOrders.map(order => (
                <OrderedTableRow tableId="workshopAcceptance" key={order.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/orders/${order.orderNumber || order.id}`)}>
                  <td data-column="orderNumber" className="whitespace-nowrap px-6 py-4 font-mono text-sm text-gray-900">{order.orderNumber || order.id}</td>
                  <td data-column="projectName" className="px-6 py-4 text-sm text-gray-900">{order.projectName || '—'}</td>
                  <td data-column="title" className="px-6 py-4 text-sm font-medium text-gray-900">{order.title}</td>
                  <td data-column="clientName" className="px-6 py-4 text-sm text-gray-900">{order.clientName}</td>
                  <td data-column="waitingConfirmationSince" className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">
                    {order.waitingConfirmationSince
                      ? new Date(order.waitingConfirmationSince).toLocaleDateString('de-DE')
                      : '—'}
                  </td>
                  <td data-column="deadline" className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">
                    {order.deadline ? new Date(order.deadline).toLocaleDateString('de-DE') : '—'}
                  </td>

                </OrderedTableRow>
              ))}
              {waitingConfirmationOrders.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-sm text-gray-500">
                    Keine Aufträge warten auf Abnahme.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* QR-Code Scanner */}
      {showBarcodeScanner && (
        <QRCodeScanner
          onScan={handleBarcodeScanned}
          onClose={() => setShowBarcodeScanner(false)}
        />
      )}
    </div>
  );
}
