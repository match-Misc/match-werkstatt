import React, { createContext, useContext, useReducer, ReactNode, useEffect } from 'react';
import { User, Order, SubTask, WorkshopAccount, ClientAccount } from '../types';

interface AppState {
  currentUser: User | null;
  orders: Order[];
  workshopAccounts: WorkshopAccount[];
  clientAccounts: ClientAccount[];
  isAuthenticated: boolean;
  notification: { message: string; type: 'success' | 'error' | 'info' } | null;
  systemConfigs: { id: string; key: string; value: string; description?: string }[];
}

type AppAction =
  | { type: 'LOGIN'; payload: User }
  | { type: 'LOGOUT' }
  | { type: 'ADD_ORDER'; payload: Order }
  | { type: 'UPDATE_ORDER'; payload: Order }
  | { type: 'DELETE_ORDER'; payload: string }
  | { type: 'ADD_SUBTASK'; payload: { orderId: string; subTask: SubTask } }
  | { type: 'UPDATE_SUBTASK'; payload: { orderId: string; subTask: SubTask } }
  | { type: 'DELETE_SUBTASK'; payload: { orderId: string; subTaskId: string } }
  | { type: 'ARCHIVE_ORDER'; payload: string }
  | { type: 'ADD_WORKSHOP_ACCOUNT'; payload: WorkshopAccount }
  | { type: 'UPDATE_WORKSHOP_ACCOUNT'; payload: WorkshopAccount }
  | { type: 'DELETE_WORKSHOP_ACCOUNT'; payload: string }
  | { type: 'ADD_CLIENT_ACCOUNT'; payload: ClientAccount }
  | { type: 'UPDATE_CLIENT_ACCOUNT'; payload: ClientAccount }
  | { type: 'SHOW_NOTIFICATION'; payload: { message: string; type: 'success' | 'error' | 'info' } }
  | { type: 'HIDE_NOTIFICATION' }
  | { type: 'LOAD_ORDERS'; payload: Order[] }
  | { type: 'LOAD_WORKSHOP_ACCOUNTS'; payload: WorkshopAccount[] }
  | { type: 'LOAD_CLIENT_ACCOUNTS'; payload: ClientAccount[] }
  | { type: 'APPROVE_CLIENT_ACCOUNT'; payload: string }
  | { type: 'DELETE_CLIENT_ACCOUNT'; payload: string }
  | { type: 'LOAD_SYSTEM_CONFIGS'; payload: { id: string; key: string; value: string; description?: string }[] }
  | { type: 'UPDATE_SYSTEM_CONFIG'; payload: { id: string; key: string; value: string; description?: string } };

const initialState: AppState = {
  currentUser: null,
  orders: [],
  workshopAccounts: [],
  clientAccounts: [],
  isAuthenticated: false,
  notification: null,
  systemConfigs: []
};

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'LOGIN':
      return {
        ...state,
        currentUser: action.payload,
        isAuthenticated: true
      };
    case 'LOGOUT':
      return {
        ...state,
        currentUser: null,
        isAuthenticated: false
      };
    case 'ADD_ORDER':
      return {
        ...state,
        orders: [...state.orders, action.payload]
      };
    case 'UPDATE_ORDER':
      return {
        ...state,
        orders: state.orders.map(order =>
          order.id === action.payload.id ? action.payload : order
        )
      };
    case 'DELETE_ORDER':
      return {
        ...state,
        orders: state.orders.filter(order => order.id !== action.payload)
      };
    case 'ADD_SUBTASK':
      return {
        ...state,
        orders: state.orders.map(order =>
          order.id === action.payload.orderId
            ? { 
                ...order, 
                subTasks: [...order.subTasks, action.payload.subTask],
                updatedAt: new Date()
              }
            : order
        )
      };
    case 'UPDATE_SUBTASK':
      return {
        ...state,
        orders: state.orders.map(order =>
          order.id === action.payload.orderId
            ? {
                ...order,
                subTasks: order.subTasks.map(subTask =>
                  subTask.id === action.payload.subTask.id ? action.payload.subTask : subTask
                ),
                updatedAt: new Date()
              }
            : order
        )
      };
    case 'DELETE_SUBTASK':
      return {
        ...state,
        orders: state.orders.map(order =>
          order.id === action.payload.orderId
            ? {
                ...order,
                subTasks: order.subTasks.filter(subTask => subTask.id !== action.payload.subTaskId),
                updatedAt: new Date()
              }
            : order
        )
      };
    case 'ARCHIVE_ORDER': {
      // Nur archivieren, wenn Hauptauftrag und alle Unteraufgaben abgeschlossen sind
      const orders = state.orders.map(order => {
        if (order.id === action.payload) {
          const allSubTasksDone = order.subTasks.length === 0 || order.subTasks.every(st => st.status === 'completed');
          // NEU: Endabnahme durch Kunden muss bestätigt sein
          const endabnahmeOk = order.status === 'completed' && !!order.confirmationDate;
          if (endabnahmeOk && allSubTasksDone) {
            return { ...order, status: 'archived' as const };
          }
        }
        return order;
      });
      return { ...state, orders };
    }
    case 'ADD_WORKSHOP_ACCOUNT':
      return {
        ...state,
        workshopAccounts: [...state.workshopAccounts, action.payload]
      };
    case 'UPDATE_WORKSHOP_ACCOUNT':
      return {
        ...state,
        workshopAccounts: state.workshopAccounts.map(account =>
          account.id === action.payload.id ? action.payload : account
        )
      };
    case 'DELETE_WORKSHOP_ACCOUNT':
      return {
        ...state,
        workshopAccounts: state.workshopAccounts.filter(account => account.id !== action.payload)
      };
    case 'ADD_CLIENT_ACCOUNT':
      return {
        ...state,
        clientAccounts: [...state.clientAccounts, action.payload]
      };
    case 'UPDATE_CLIENT_ACCOUNT':
      return {
        ...state,
        clientAccounts: state.clientAccounts.map(account =>
          account.id === action.payload.id ? action.payload : account
        )
      };
    case 'APPROVE_CLIENT_ACCOUNT':
      return {
        ...state,
        clientAccounts: state.clientAccounts.map(account =>
          account.id === action.payload ? { ...account, isApproved: true } : account
        )
      };
    case 'DELETE_CLIENT_ACCOUNT':
      return {
        ...state,
        clientAccounts: state.clientAccounts.filter(account => account.id !== action.payload)
      };
    case 'SHOW_NOTIFICATION':
      return {
        ...state,
        notification: action.payload
      };
    case 'HIDE_NOTIFICATION':
      return {
        ...state,
        notification: null
      };
    case 'LOAD_ORDERS':
      return {
        ...state,
        orders: action.payload
      };
    case 'LOAD_WORKSHOP_ACCOUNTS':
      return {
        ...state,
        workshopAccounts: action.payload
      };
    case 'LOAD_CLIENT_ACCOUNTS':
      return {
        ...state,
        clientAccounts: action.payload
      };
    case 'LOAD_SYSTEM_CONFIGS':
      return {
        ...state,
        systemConfigs: action.payload
      };
    case 'UPDATE_SYSTEM_CONFIG':
      return {
        ...state,
        systemConfigs: state.systemConfigs.map(config => 
          config.key === action.payload.key ? action.payload : config
        )
      };
    default:
      return state;
  }
}

const AppContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
} | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  // Persistenter Login + Auto-Logout nach 15min Inaktivität
  useEffect(() => {
    // Prüfe, ob User im localStorage gespeichert ist
    const storedUser = localStorage.getItem('currentUser');
    if (storedUser) {
      dispatch({ type: 'LOGIN', payload: JSON.parse(storedUser) });
    }
    let logoutTimer: ReturnType<typeof setTimeout> | null = null;
    const resetTimer = () => {
      if (logoutTimer) clearTimeout(logoutTimer);
      logoutTimer = setTimeout(() => {
        dispatch({ type: 'LOGOUT' });
        localStorage.removeItem('currentUser');
      }, 15 * 60 * 1000); // 15 Minuten
    };
    // Events für Aktivität
    const activityEvents = ['mousemove', 'keydown', 'mousedown', 'touchstart'];
    activityEvents.forEach(evt => window.addEventListener(evt, resetTimer));
    resetTimer();
    return () => {
      if (logoutTimer) clearTimeout(logoutTimer);
      activityEvents.forEach(evt => window.removeEventListener(evt, resetTimer));
    };
  }, []);

  // Speichere User bei Login/Logout in localStorage
  useEffect(() => {
    if (state.currentUser) {
      localStorage.setItem('currentUser', JSON.stringify(state.currentUser));
    } else {
      localStorage.removeItem('currentUser');
    }
  }, [state.currentUser]);

  useEffect(() => {
    const persistedUserRaw = localStorage.getItem('currentUser');
    let persistedUserRole = '';
    if (persistedUserRaw) {
      try {
        const parsed = JSON.parse(persistedUserRaw);
        persistedUserRole = parsed?.role || '';
      } catch {
        persistedUserRole = '';
      }
    }

    const viewerRole = state.currentUser?.role || persistedUserRole;
    const ordersUrl = viewerRole
      ? `/api/orders?viewerRole=${encodeURIComponent(viewerRole)}`
      : '/api/orders';

    // Initialdaten laden
    fetch(ordersUrl)
      .then(res => res.json())
      .then((orders: Order[]) => {
        dispatch({ type: 'SHOW_NOTIFICATION', payload: { message: 'Aufträge geladen', type: 'info' } });
        dispatch({ type: 'LOAD_ORDERS', payload: orders });
      });
    fetch('/api/users')
      .then(res => res.json())
      .then((users: any[]) => {
        dispatch({ type: 'LOAD_WORKSHOP_ACCOUNTS', payload: users.filter((u: any) => u.role === 'workshop' || u.role === 'admin') });
        dispatch({ type: 'LOAD_CLIENT_ACCOUNTS', payload: users.filter((u: any) => u.role === 'client') });
      });
    // WebSocket-Verbindung
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${wsProtocol}//${window.location.host}/ws`);
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'ordersUpdated') {
        dispatch({ type: 'LOAD_ORDERS', payload: msg.payload });
      }
      if (msg.type === 'usersUpdated') {
        dispatch({ type: 'LOAD_WORKSHOP_ACCOUNTS', payload: msg.payload.filter((u: any) => u.role === 'workshop' || u.role === 'admin') });
        dispatch({ type: 'LOAD_CLIENT_ACCOUNTS', payload: msg.payload.filter((u: any) => u.role === 'client') });
      }
    };
    return () => ws.close();
  }, [state.currentUser?.role]);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}