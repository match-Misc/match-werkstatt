import { useState, useEffect } from 'react';
import { Clock, User, Eye, Edit2, Filter, Search, QrCode, Plus, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import QRCodeScanner from './QRCodeScanner';
import { Order } from '../types';

export default function WorkshopDashboard() {
  const { state, dispatch } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'all' | 'assigned'>('all');
  const [orders, setOrders] = useState<Order[]>(Array.isArray(state.orders) ? state.orders : []);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
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
  const sortedOrders = [...activeOrders].sort((a, b) => {
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
      } else if (sortConfig.key === 'deadline') {
        aVal = new Date(a.deadline).getTime();
        bVal = new Date(b.deadline).getTime();
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
  });

  const filteredOrders = sortedOrders.filter(order => {
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
    const matchesSearch = order.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         order.clientName.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'accepted': return 'bg-blue-100 text-blue-800';
      case 'in_progress': return 'bg-purple-100 text-purple-800';
      case 'revision': return 'bg-orange-100 text-orange-800';
      case 'rework': return 'bg-orange-100 text-orange-800'; // Konsistente Farbe für Nacharbeit
      case 'waiting_confirmation': return 'bg-cyan-100 text-cyan-800';
      case 'completed': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending': return 'Ausstehend';
      case 'accepted': return 'Angenommen';
      case 'in_progress': return 'In Bearbeitung';
      case 'revision': return 'Überarbeitung';
      case 'rework': return 'In Nacharbeit'; // Konsistenter Text
      case 'waiting_confirmation': return 'Wartet auf Abnahme';
      case 'completed': return 'Abgeschlossen';
      default: return status;
    }
  };

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
      case 'high': return 'Hoch';
      case 'medium': return 'Mittel';
      case 'low': return 'Niedrig';
      default: return priority;
    }
  };

  const isOverdue = (deadline: Date) => {
    return new Date(deadline) < new Date();
  };

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
  const fertigungOrders = displayItems.filter(item => item.type === 'order' && item.order && item.order.orderType === 'fertigung');
  const serviceOrders = displayItems.filter(item => item.type === 'order' && item.order && item.order.orderType === 'service');

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
          <h2 className="text-2xl font-bold text-gray-900">Werkstattaufträge</h2>
        </div>
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Suchen..."
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
              <option value="all">Alle Status</option>
              <option value="pending">Ausstehend</option>
              <option value="accepted">Angenommen</option>
              <option value="in_progress">In Bearbeitung</option>
              <option value="revision">Überarbeitung</option>
              <option value="rework">Nacharbeit</option>
              <option value="completed">Abgeschlossen</option>
            </select>
          </div>
          {['workshop', 'employee', 'manager'].includes(state.currentUser?.role || '') && (
            <select
              value={viewMode}
              onChange={(e) => setViewMode(e.target.value as 'all' | 'assigned')}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            >
              <option value="all">Alle Aufträge</option>
              <option value="assigned">Meine Aufträge</option>
            </select>
          )}
          <button
            onClick={() => setShowBarcodeScanner(true)}
            className="bg-gray-100 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-200 transition-colors flex items-center text-sm"
            title="QR-Code-Scanner öffnen"
          >
            <QrCode className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Scannen</span>
          </button>
          {['admin', 'workshop', 'employee', 'manager'].includes(state.currentUser?.role || '') && (
            <button
              onClick={() => navigate('/orders/new')}
              className="bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center text-sm"
            >
              <Plus className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Auftrag anlegen</span>
            </button>
          )}
        </div>
      </div>

      {/* Fertigungsaufträge Tabelle */}
      {fertigungOrders.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border mb-6">
          <div className="p-4 border-b">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Fertigungsaufträge</h3>
          </div>
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('createdAt')}>
                    <div className="flex items-center space-x-1">
                      <span>Erstellt</span>
                      {sortConfig.key === 'createdAt' ? (sortConfig.direction === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />) : <ArrowUpDown className="w-4 h-4 opacity-0 group-hover:opacity-100" />}
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('priority')}>
                    <div className="flex items-center space-x-1">
                      <span>Priorität</span>
                      {sortConfig.key === 'priority' ? (sortConfig.direction === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />) : <ArrowUpDown className="w-4 h-4 opacity-0 group-hover:opacity-100" />}
                    </div>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Zugewiesen</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Zeit</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Aktionen</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {fertigungOrders.map((item) => {
                  const order = item.order;
                  return (
                    <tr key={`order-${order.id}`} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{order.title}</div>
                        <div className="text-xs text-gray-500 font-mono">{order.orderNumber || order.id}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{order.clientName}</div>
                        <div className="text-sm text-gray-500">{order.costCenter}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{new Date(order.createdAt).toLocaleDateString('de-DE')}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className={`text-sm ${isOverdue(order.deadline) ? 'text-red-600 font-medium' : 'text-gray-900'}`}>
                          {new Date(order.deadline).toLocaleDateString('de-DE')}
                        </div>
                        {isOverdue(order.deadline) && (
                          <div className="text-xs text-red-600">Überfällig</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(order.status)}`}>
                          {getStatusText(order.status)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs rounded-full ${getPriorityColor(order.priority)}`}>
                          {getPriorityText(order.priority)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
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
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center text-sm text-gray-900">
                          <Clock className="w-4 h-4 text-gray-400 mr-1" />
                          {order.estimatedHours}h
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex space-x-3">
                          <button
                            onClick={() => navigate(`/orders/${order.orderNumber || order.id}`)}
                            className="text-blue-600 hover:text-blue-800 flex items-center"
                          >
                            <Eye className="w-4 h-4 mr-1" />
                            Anzeigen
                          </button>
                          <button
                            onClick={() => navigate(`/orders/${order.orderNumber || order.id}/edit`)}
                            className="text-orange-600 hover:text-orange-800 flex items-center"
                          >
                            <Edit2 className="w-4 h-4 mr-1" />
                            Bearbeiten
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

      {/* Serviceaufträge Tabelle */}
      {serviceOrders.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border mb-6">
          <div className="p-4 border-b">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Serviceaufträge</h3>
          </div>
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('createdAt')}>
                    <div className="flex items-center space-x-1">
                      <span>Erstellt</span>
                      {sortConfig.key === 'createdAt' ? (sortConfig.direction === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />) : <ArrowUpDown className="w-4 h-4 opacity-0 group-hover:opacity-100" />}
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('priority')}>
                    <div className="flex items-center space-x-1">
                      <span>Priorität</span>
                      {sortConfig.key === 'priority' ? (sortConfig.direction === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />) : <ArrowUpDown className="w-4 h-4 opacity-0 group-hover:opacity-100" />}
                    </div>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Zugewiesen</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Zeit</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Aktionen</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {serviceOrders.map((item) => {
                  const order = item.order;
                  return (
                    <tr key={`order-${order.id}`} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{order.title}</div>
                        <div className="text-xs text-gray-500 font-mono">{order.orderNumber || order.id}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{order.clientName}</div>
                        <div className="text-sm text-gray-500">{order.costCenter}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{new Date(order.createdAt).toLocaleDateString('de-DE')}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className={`text-sm ${isOverdue(order.deadline) ? 'text-red-600 font-medium' : 'text-gray-900'}`}>
                          {new Date(order.deadline).toLocaleDateString('de-DE')}
                        </div>
                        {isOverdue(order.deadline) && (
                          <div className="text-xs text-red-600">Überfällig</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(order.status)}`}>
                          {getStatusText(order.status)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs rounded-full ${getPriorityColor(order.priority)}`}>
                          {getPriorityText(order.priority)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
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
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center text-sm text-gray-900">
                          <Clock className="w-4 h-4 text-gray-400 mr-1" />
                          {order.estimatedHours}h
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex space-x-3">
                          <button
                            onClick={() => navigate(`/orders/${order.orderNumber || order.id}`)}
                            className="text-blue-600 hover:text-blue-800 flex items-center"
                          >
                            <Eye className="w-4 h-4 mr-1" />
                            Anzeigen
                          </button>
                          <button
                            onClick={() => navigate(`/orders/${order.orderNumber || order.id}/edit`)}
                            className="text-orange-600 hover:text-orange-800 flex items-center"
                          >
                            <Edit2 className="w-4 h-4 mr-1" />
                            Bearbeiten
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