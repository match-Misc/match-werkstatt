import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import OrderForm from './OrderForm';
import { Order } from '../types';

export default function EditOrderPage() {
  const { orderNumber } = useParams<{ orderNumber: string }>();
  const navigate = useNavigate();
  const { state } = useApp();
  
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchOrder() {
      if (!orderNumber) return;
      
      try {
        setLoading(true);
        const viewerRole = state.currentUser?.role || 'guest';
        const res = await fetch(`/api/orders/number/${encodeURIComponent(orderNumber)}?viewerRole=${encodeURIComponent(viewerRole)}`);
        
        if (!res.ok) {
          if (res.status === 403) {
            setError('Zugriff verweigert');
            setLoading(false);
            return;
          }
          if (res.status === 404) {
            setError('Auftrag nicht gefunden');
            setLoading(false);
            return;
          }
          throw new Error('Fehler beim Laden des Auftrags');
        }
        
        const data = await res.json();
        
        // Additional check: is client allowed to edit?
        const isClient = viewerRole === 'client';
        if (isClient && (data.clientId !== state.currentUser?.id || data.status === 'completed')) {
           setError('Zugriff verweigert: Du kannst diesen Auftrag nicht mehr bearbeiten.');
           setLoading(false);
           return;
        }

        setOrder(data);
      } catch (err) {
        console.error(err);
        setError('Ein unerwarteter Fehler ist aufgetreten.');
      } finally {
        setLoading(false);
      }
    }
    
    fetchOrder();
  }, [orderNumber, state.currentUser]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[50vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[50vh]">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Fehler</h2>
        <p className="text-gray-600 mb-4">{error || 'Auftrag konnte nicht geladen werden.'}</p>
        <button
          onClick={() => navigate('/dashboard')}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          Zurück zur Übersicht
        </button>
      </div>
    );
  }

  const handleClose = () => {
    navigate(`/orders/${orderNumber}`);
  };

  return <OrderForm mode="edit" initialData={order} onClose={handleClose} />;
}
