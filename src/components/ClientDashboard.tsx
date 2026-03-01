import { useState, useEffect } from 'react';
import { Plus, FileText, Calendar, DollarSign, Clock, Eye, Edit2 } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import CreateOrder from './CreateOrder';
import OrderDetails from './OrderDetails';
import EditOrder from './EditOrder';
import EndabnahmeActions from './EndabnahmeActions';
import { Order } from '../types';

export default function ClientDashboard() {
  const { state, dispatch } = useApp();
  const location = useLocation();
  const [showCreateOrder, setShowCreateOrder] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [orders, setOrders] = useState<Order[]>(state.orders);

  // Orders nach jedem Öffnen/Schließen des Modals neu laden
  const fetchOrders = async () => {
    const res = await fetch('/api/orders');
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

  const waitingOrders = userOrders.filter(order => order.status === 'waiting_confirmation');
  // Aufträge zur Überarbeitung oder Nacharbeit werden im Dashboard angezeigt
  const otherOrders = userOrders.filter(order => order.status !== 'waiting_confirmation');

  // Archivierte Aufträge des aktuellen Kunden
  const archivedOrders = state.orders.filter(order => order.clientId === state.currentUser?.id && order.status === 'archived');

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

  if (showCreateOrder) {
    return <CreateOrder onClose={() => { setShowCreateOrder(false); fetchOrders(); }} />;
  }

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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Meine Aufträge</h2>
          <p className="text-gray-600 mt-1">Verwalten Sie Ihre Werkstattaufträge</p>
        </div>
        <button
          onClick={() => setShowCreateOrder(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center"
        >
          <Plus className="w-4 h-4 mr-2" />
          Neuer Auftrag
        </button>
      </div>

      {/* Aktuelle Aufträge */}
      {otherOrders.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-bold text-gray-900 mb-2">Aktuelle Aufträge</h3>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {otherOrders.map((order) => (
              <div
                key={order.id}
                className={`bg-white rounded-lg shadow-sm border hover:shadow-md transition-shadow ${
                  order.status === 'revision' ? 'border-orange-300 bg-orange-50' : 'border-gray-200'
                }`}
              >
                <div className="p-6">
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-lg font-semibold text-gray-900 truncate">{order.title}</h3>
                    <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(order.status)}`}>
                      {getStatusText(order.status)}
                    </span>
                  </div>
                  
                  {order.status === 'revision' && (
                    <div className="mb-4 p-3 bg-orange-100 border border-orange-200 rounded-lg">
                      <p className="text-sm text-orange-800 font-medium">
                        Überarbeitung erforderlich
                      </p>
                      <p className="text-xs text-orange-700 mt-1">
                        Bitte überarbeiten Sie den Auftrag und reichen Sie ihn erneut ein.
                      </p>
                    </div>
                  )}
                  
                  {order.status === 'rework' && (
                    <div className="mb-4 p-3 bg-blue-100 border border-blue-200 rounded-lg">
                      <p className="text-sm text-blue-800 font-medium">
                        Auftrag in Nacharbeit
                      </p>
                      <p className="text-xs text-blue-700 mt-1">
                        Die Werkstatt bearbeitet Ihre Anmerkungen.
                      </p>
                    </div>
                  )}

                  <p className="text-gray-600 text-sm mb-4 line-clamp-2">{order.description}</p>
                  
                  <div className="space-y-2 mb-4">
                    <div className="flex items-center text-sm text-gray-600">
                      <Calendar className="w-4 h-4 mr-2" />
                      Deadline: {new Date(order.deadline).toLocaleDateString('de-DE')}
                    </div>
                    <div className="flex items-center text-sm text-gray-600">
                      <DollarSign className="w-4 h-4 mr-2" />
                      Kostenstelle: {order.costCenter}
                    </div>
                    <div className="flex items-center text-sm text-gray-600">
                      <Clock className="w-4 h-4 mr-2" />
                      Geschätzt: {order.estimatedHours}h
                    </div>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-500">
                      {order.documents.length} Dokument(e)
                    </span>
                    <div className="flex space-x-2">
                      {(order.status === 'revision' || order.status === 'rework') && (
                        <button
                          onClick={() => setEditingOrder(order)}
                          className="text-orange-600 hover:text-orange-800 text-sm flex items-center"
                        >
                          <Edit2 className="w-4 h-4 mr-1" />
                          Bearbeiten
                        </button>
                      )}
                      <button
                        onClick={() => setSelectedOrder(order)}
                        className="text-blue-600 hover:text-blue-800 text-sm flex items-center"
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        Anzeigen
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Archivierte Aufträge */}
      {archivedOrders.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-bold text-gray-900 mb-2">Archivierte Aufträge</h3>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {archivedOrders.map((order) => (
              <div key={order.id} className="bg-gray-100 border border-gray-300 rounded-lg shadow-sm p-6">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 truncate">{order.title}</h3>
                  <span className="px-2 py-1 text-xs rounded-full bg-gray-200 text-gray-700">Archiviert</span>
                </div>
                <div className="mb-2 text-gray-700">{order.description}</div>
                <div className="flex justify-end mt-4">
                  <button
                    className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                    onClick={() => setSelectedOrder(order)}
                  >
                    Anzeigen
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {waitingOrders.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-bold text-gray-900 mb-2">Aufträge zur Endabnahme</h3>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {waitingOrders.map((order) => (
              <div key={order.id} className="bg-yellow-50 border-yellow-300 border rounded-lg shadow-sm p-6">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 truncate">{order.title}</h3>
                  <span className="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-800">Warten auf Endabnahme</span>
                </div>
                <div className="mb-2 text-gray-700">{order.description}</div>
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
                  onRequestRevision={async (revisionComment, newDeadlineStr) => {
                    if (!revisionComment) return;
                    let newDeadline: Date | undefined = undefined;
                    if (newDeadlineStr) {
                      const d = new Date(newDeadlineStr);
                      if (!isNaN(d.getTime())) newDeadline = d;
                    }
                    
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
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}