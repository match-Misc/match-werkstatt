import { useState, useEffect } from 'react';
import { Clock, User, Eye, Filter, Search, Settings, QrCode } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import WorkshopOrderDetails from './WorkshopOrderDetails';
import AccountManagement from './AccountManagement';
import ArchiveView from './ArchiveView';
import CreateOrder from './CreateOrder';
import QRCodeScanner from './QRCodeScanner';
import { Order } from '../types';

export default function WorkshopDashboard() {
  const { state, dispatch } = useApp();
  const location = useLocation();
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showAccountManagement, setShowAccountManagement] = useState(false);
  const [viewMode, setViewMode] = useState<'all' | 'assigned'>('all');
  const [showArchive, setShowArchive] = useState(false);
  const [showCreateOrder, setShowCreateOrder] = useState(false);
  const [orders, setOrders] = useState<Order[]>(Array.isArray(state.orders) ? state.orders : []);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);

  // Orders nach jedem Öffnen/Schließen des Modals neu laden
  const fetchOrders = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/orders');
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

  // QR-Code-Scanner Handler
  const handleBarcodeScanned = async (code: string) => {
    try {
      console.log('QR-Code gescannt:', code);
      
      // Suche nach Auftrag mit diesem Code
      const response = await fetch(`http://localhost:3001/api/orders/barcode/${encodeURIComponent(code)}`);
      
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
      setSelectedOrder(order);
      
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
        setSelectedOrder(orderToOpen);
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
    if (viewMode === 'assigned' && state.currentUser?.role === 'workshop') {
      filtered = filtered.filter(order =>
        order.assignedTo === state.currentUser?.id ||
        (Array.isArray(order.subTasks) && order.subTasks.some(subTask => subTask.assignedTo === state.currentUser?.id))
      );
    }
    return filtered;
  };

  const activeOrders = getFilteredOrders();
  
  // Sort orders by deadline priority
  const sortedOrders = [...activeOrders].sort((a, b) => {
    // First by deadline
    const deadlineA = new Date(a.deadline).getTime();
    const deadlineB = new Date(b.deadline).getTime();
    return deadlineA - deadlineB;
  });

  const filteredOrders = sortedOrders.filter(order => {
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
    const matchesSearch = order.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         order.clientName.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  // Get user's assigned subtasks
  const getMySubTasks = () => {
    if (state.currentUser?.role !== 'workshop') return [];
    
    const mySubTasks: Array<{order: Order, subTask: any}> = [];
    state.orders.forEach(order => {
      if (Array.isArray(order.subTasks)) {
        order.subTasks.forEach(subTask => {
          if (subTask.assignedTo === state.currentUser?.id && subTask.status !== 'completed') {
            mySubTasks.push({ order, subTask });
          }
        });
      }
    });
    return mySubTasks;
  };

  const mySubTasks = getMySubTasks();

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
        setSelectedOrder(order);
        dispatch({ 
          type: 'SHOW_NOTIFICATION', 
          payload: { message: `Auftrag "${order.orderNumber || order.id}" geöffnet.`, type: 'success' } 
        });
      }
    } else if (barcode) {
      handleBarcodeScanned(barcode);
    }
  }, [location.search, orders, handleBarcodeScanned, dispatch]);

  if (showAccountManagement) {
    return <AccountManagement onClose={() => setShowAccountManagement(false)} />;
  }

  if (showArchive) {
    return <ArchiveView onClose={() => setShowArchive(false)} />;
  }

  if (selectedOrder) {
    return <WorkshopOrderDetails order={selectedOrder} onClose={() => setSelectedOrder(null)} />;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Werkstattaufträge</h2>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowBarcodeScanner(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center"
            title="QR-Code-Scanner öffnen - Sie werden zur Kamera-Berechtigung aufgefordert"
          >
            <QrCode className="w-4 h-4 mr-2" />
            📷 QR-Code scannen
          </button>
          <button
            onClick={() => setShowArchive(true)}
            className="bg-gray-700 text-white px-4 py-2 rounded-lg hover:bg-gray-900 transition-colors"
          >
            Archiv
          </button>
          {state.currentUser?.role === 'admin' && (
            <button
              onClick={() => setShowAccountManagement(true)}
              className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors flex items-center"
            >
              <Settings className="w-4 h-4 mr-2" />
              Benutzerverwaltung
            </button>
          )}
          {(state.currentUser?.role === 'admin' || state.currentUser?.role === 'workshop') && (
            <button
              onClick={() => setShowCreateOrder(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center"
            >
              + Auftrag anlegen
            </button>
          )}
        </div>
      </div>
      {/* Modal für Auftragserstellung */}
      {showCreateOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto relative">
            <button
              onClick={() => { setShowCreateOrder(false); fetchOrders(); }}
              className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 text-xl"
              aria-label="Schließen"
            >
              ×
            </button>
            <CreateOrder onClose={() => { setShowCreateOrder(false); fetchOrders(); }} />
          </div>
        </div>
      )}
      {/* My Subtasks Section for Workshop Users */}
      {state.currentUser?.role === 'workshop' && mySubTasks.length > 0 && (
        <div className="bg-blue-50 rounded-lg p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Meine Unteraufgaben</h3>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {mySubTasks.map(({ order, subTask }) => (
              <div key={subTask.id} className="bg-white rounded-lg p-4 shadow-sm border">
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-medium text-gray-900 text-sm">{subTask.title}</h4>
                  <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(subTask.status)}`}>
                    {getStatusText(subTask.status)}
                  </span>
                </div>
                <p className="text-xs text-gray-600 mb-2">{subTask.description}</p>
                <div className="text-xs text-gray-500 mb-2">
                  Hauptauftrag: {order.title}
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>{subTask.estimatedHours}h geschätzt</span>
                  <button
                    onClick={() => setSelectedOrder(order)}
                    className="text-blue-600 hover:text-blue-800"
                  >
                    Öffnen
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Suchleiste separat */}
      <div className="bg-white rounded-lg shadow-sm border mb-6 p-4 flex flex-col sm:flex-row gap-4 items-center">
        <div className="flex-1 relative w-full">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Auftrag oder Auftraggeber suchen..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">Alle Status</option>
            <option value="pending">Ausstehend</option>
            <option value="accepted">Angenommen</option>
            <option value="in_progress">In Bearbeitung</option>
            <option value="revision">Überarbeitung</option>
            <option value="rework">Nacharbeit</option>
            <option value="completed">Abgeschlossen</option>
          </select>
          {state.currentUser?.role === 'workshop' && (
            <select
              value={viewMode}
              onChange={(e) => setViewMode(e.target.value as 'all' | 'assigned')}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">Alle Aufträge</option>
              <option value="assigned">Meine Aufträge</option>
            </select>
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Auftrag</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Auftraggeber</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Deadline</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Priorität</th>
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
                      <td className="px-6 py-4 whitespace-nowrap">
                        <button
                          onClick={() => setSelectedOrder(order)}
                          className="text-blue-600 hover:text-blue-800 text-sm flex items-center"
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          Anzeigen
                        </button>
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Auftrag</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Auftraggeber</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Deadline</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Priorität</th>
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
                      <td className="px-6 py-4 whitespace-nowrap">
                        <button
                          onClick={() => setSelectedOrder(order)}
                          className="text-blue-600 hover:text-blue-800 text-sm flex items-center"
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          Anzeigen
                        </button>
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