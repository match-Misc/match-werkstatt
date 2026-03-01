import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Order } from '../types';
import OrderDetails from './OrderDetails';

export default function ArchiveView({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useApp();
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  const archivedOrders = state.orders.filter(order => order.status === 'archived');

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
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Archivierte Aufträge</h2>
        <button onClick={onClose} className="px-4 py-2 border rounded-lg text-gray-700 hover:bg-gray-100">Zurück</button>
      </div>
      {archivedOrders.length === 0 ? (
        <p className="text-gray-500">Keine archivierten Aufträge vorhanden.</p>
      ) : (
        <div className="space-y-4">
          {archivedOrders.map(order => {
            const imageUrl = getTitleImageUrl(order);
            return (
              <div key={order.id} className="bg-white rounded-lg shadow-sm border p-4 flex justify-between items-center">
                <div className="flex items-center gap-4">
                  {imageUrl && (
                    <img src={imageUrl} alt={order.title} className="w-20 h-20 object-cover rounded-md" />
                  )}
                  <div>
                    <div className="font-semibold text-lg">{order.title}</div>
                    <div className="text-sm text-gray-500">#{order.orderNumber || order.id}</div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setSelectedOrder(order)} className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">Details</button>
                  <button onClick={() => handleRestore(order)} className="px-3 py-1 bg-orange-500 text-white rounded hover:bg-orange-600">Nacharbeiten</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
