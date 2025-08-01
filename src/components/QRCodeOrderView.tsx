import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import WorkshopOrderDetails from '../components/WorkshopOrderDetails';
import OrderDetails from '../components/OrderDetails';
import { Order } from '../types';

export default function QRCodeOrderView() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { state } = useApp();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchOrder = async () => {
      if (!orderId) {
        setError('Keine Auftragsnummer angegeben');
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`http://localhost:3001/api/orders/barcode/${encodeURIComponent(orderId)}`);
        
        if (!response.ok) {
          if (response.status === 404) {
            setError('Auftrag nicht gefunden');
          } else {
            setError('Fehler beim Laden des Auftrags');
          }
          setLoading(false);
          return;
        }

        const orderData = await response.json();
        setOrder(orderData);
      } catch (err) {
        console.error('Error fetching order:', err);
        setError('Netzwerkfehler beim Laden des Auftrags');
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [orderId]);

  const handleClose = () => {
    navigate('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Auftrag wird geladen...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-bold text-red-600 mb-4">Fehler</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            Zurück zur Hauptseite
          </button>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Auftrag nicht gefunden</div>
      </div>
    );
  }

  // Zeige die entsprechende Detailansicht basierend auf der Benutzerrolle
  if (state.currentUser?.role === 'workshop' || state.currentUser?.role === 'admin') {
    return <WorkshopOrderDetails order={order} onClose={handleClose} />;
  } else {
    return <OrderDetails order={order} onClose={handleClose} />;
  }
}
