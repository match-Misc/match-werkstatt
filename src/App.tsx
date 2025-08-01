import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, useParams } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import Login from './components/Login';
import Header from './components/Header';
import ClientDashboard from './components/ClientDashboard';
import WorkshopDashboard from './components/WorkshopDashboard';
import Notification from './components/Notification';

// Component for handling QR-Code direct links
function OrderDirectAccess() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { state } = useApp();

  useEffect(() => {
    if (orderId && !state.isAuthenticated) {
      // Store the intended destination
      sessionStorage.setItem('qr_redirect_order', orderId);
      return;
    }

    if (orderId && state.isAuthenticated) {
      // Navigate to the appropriate dashboard with the order selected
      if (state.currentUser?.role === 'client') {
        navigate('/', { state: { openOrderId: orderId } });
      } else {
        navigate('/', { state: { openOrderId: orderId } });
      }
    }
  }, [orderId, state.isAuthenticated, state.currentUser, navigate]);

  // If not authenticated, show login
  if (!state.isAuthenticated) {
    return <Login />;
  }

  // Redirect to main app
  return null;
}

function AppContent() {
  const { state } = useApp();
  const navigate = useNavigate();

  // Handle QR redirect after login
  useEffect(() => {
    const qrRedirectOrder = sessionStorage.getItem('qr_redirect_order');
    if (qrRedirectOrder && state.isAuthenticated) {
      sessionStorage.removeItem('qr_redirect_order');
      navigate(`/order/${qrRedirectOrder}`);
    }
  }, [state.isAuthenticated, navigate]);

  return (
    <Routes>
      <Route path="/order/:orderId" element={<OrderDirectAccess />} />
      <Route path="/" element={
        <>
          {!state.isAuthenticated ? (
            <Login />
          ) : (
            <div className="min-h-screen bg-gray-50">
              <Header />
              <main>
                {state.currentUser?.role === 'client' ? (
                  <ClientDashboard />
                ) : (
                  <WorkshopDashboard />
                )}
              </main>
              <Notification />
            </div>
          )}
        </>
      } />
    </Routes>
  );
}

function App() {
  return (
    <AppProvider>
      <Router>
        <AppContent />
      </Router>
    </AppProvider>
  );
}

export default App;