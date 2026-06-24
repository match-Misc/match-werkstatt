import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useParams, Outlet, useLocation } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import Login from './components/Login';
import ClientDashboard from './components/ClientDashboard';
import WorkshopDashboard from './components/WorkshopDashboard';
import Notification from './components/Notification';
import GuestDashboard from './components/GuestDashboard';
import TaskOverview from './components/TaskOverview';
import ArchiveView from './components/ArchiveView';
import AccountManagement from './components/AccountManagement';
import UserManagement from './components/UserManagement';
import SidebarLayout from './components/layouts/SidebarLayout';
import GuestLayout from './components/layouts/GuestLayout';
import CreateOrder from './components/CreateOrder';
import OrderDetailsPage from './components/OrderDetailsPage';

// Auth Guard
function RequireAuth({ children }: { children: JSX.Element }) {
  const { state } = useApp();
  const location = useLocation();

  if (!state.isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return children;
}

// Role Guard
function RequireRole({ allowedRoles, children }: { allowedRoles: string[], children: JSX.Element }) {
  const { state } = useApp();
  const userRole = state.currentUser?.role;

  if (!userRole || !allowedRoles.includes(userRole)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

// Root Redirect based on Role
function RootRedirect() {
  const { state } = useApp();
  const userRole = state.currentUser?.role;

  if (!state.isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (userRole === 'guest') {
    return <Navigate to="/guest" replace />;
  }

  return <Navigate to="/dashboard" replace />;
}

// Component for handling QR-Code direct links
function OrderDirectAccess() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { state } = useApp();

  useEffect(() => {
    if (orderId && !state.isAuthenticated) {
      sessionStorage.setItem('qr_redirect_order', orderId);
      navigate('/login');
      return;
    }

    if (orderId && state.isAuthenticated) {
      if (state.currentUser?.role === 'guest') {
        navigate('/guest');
      } else {
        navigate('/dashboard', { state: { openOrderId: orderId } });
      }
    }
  }, [orderId, state.isAuthenticated, state.currentUser, navigate]);

  return null;
}

// Login Page with QR Redirect handling
function LoginPage() {
  const { state } = useApp();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (state.isAuthenticated) {
      const qrRedirectOrder = sessionStorage.getItem('qr_redirect_order');
      if (qrRedirectOrder) {
        sessionStorage.removeItem('qr_redirect_order');
        navigate(`/order/${qrRedirectOrder}`, { replace: true });
      } else {
        const from = (location.state as any)?.from?.pathname || "/";
        navigate(from, { replace: true });
      }
    }
  }, [state.isAuthenticated, navigate, location]);

  return (
    <>
      <Login />
      <Notification />
    </>
  );
}

// App Content with Routes
function AppContent() {
  const { state } = useApp();

  // Dynamisches Rendering für das Dashboard basierend auf Rolle
  const renderDashboard = () => {
    const role = state.currentUser?.role;
    if (role === 'client') {
      return <ClientDashboard />;
    } else {
      return <WorkshopDashboard />;
    }
  };

  return (
    <>
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/order/:orderId" element={<OrderDirectAccess />} />

        {/* Root Redirect */}
        <Route path="/" element={<RootRedirect />} />

        {/* Guest Routes (GuestLayout) */}
        <Route element={<RequireAuth><GuestLayout /></RequireAuth>}>
          <Route path="/guest" element={
            <RequireRole allowedRoles={['guest']}>
              <GuestDashboard />
            </RequireRole>
          } />
        </Route>

        {/* Main App Routes (SidebarLayout) */}
        <Route element={<RequireAuth><SidebarLayout /></RequireAuth>}>
          <Route path="/dashboard" element={
            <RequireRole allowedRoles={['admin', 'workshop', 'employee', 'manager', 'client']}>
              {renderDashboard()}
            </RequireRole>
          } />
          
          <Route path="/tasks" element={
            <RequireRole allowedRoles={['admin', 'workshop', 'employee', 'manager']}>
              <TaskOverview />
            </RequireRole>
          } />

          <Route path="/orders/new" element={
            <RequireRole allowedRoles={['admin', 'workshop', 'employee', 'manager', 'client']}>
              <CreateOrder />
            </RequireRole>
          } />
          
          <Route path="/orders/:orderNumber" element={
            <RequireRole allowedRoles={['admin', 'workshop', 'employee', 'manager', 'client']}>
              <OrderDetailsPage />
            </RequireRole>
          } />
          
          <Route path="/archive" element={
            <RequireRole allowedRoles={['admin', 'workshop', 'employee', 'manager', 'client']}>
              <ArchiveView />
            </RequireRole>
          } />
          
          <Route path="/settings" element={
            <RequireRole allowedRoles={['admin', 'workshop', 'employee', 'manager', 'client']}>
              <AccountManagement />
            </RequireRole>
          } />

          <Route path="/admin/users" element={
            <RequireRole allowedRoles={['admin']}>
              <UserManagement />
            </RequireRole>
          } />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Notification />
    </>
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