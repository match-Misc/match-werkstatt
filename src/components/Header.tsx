import React from 'react';
import { LogOut, Building2, User, Menu } from 'lucide-react';
import { useApp } from '../context/AppContext';

interface HeaderProps {
  toggleSidebar?: () => void;
  isSidebarExpanded?: boolean;
}

export default function Header({ toggleSidebar, isSidebarExpanded }: HeaderProps) {
  const { state, dispatch } = useApp();

  const handleLogout = () => {
    dispatch({ type: 'LOGOUT' });
  };

  return (
    <header className="bg-white shadow-sm border-b shrink-0">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <button 
              onClick={() => window.location.href = '/'}
              className="flex items-center hover:opacity-80 transition-opacity"
            >
              <Building2 className="w-8 h-8 text-blue-600 mr-3" />
              <h1 className="text-xl font-bold text-gray-900 hidden sm:block">Werkstatt-Verwaltung</h1>
            </button>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <User className="w-4 h-4 text-gray-600 hidden sm:block" />
              <span className="text-sm font-medium text-gray-700 hidden sm:block">
                {state.currentUser?.name}
              </span>
              <span className={`px-2 py-1 text-xs rounded-full ${
                state.currentUser?.role === 'admin'
                  ? 'bg-purple-100 text-purple-800'
                  : ['manager', 'employee', 'workshop'].includes(state.currentUser?.role || '')
                  ? 'bg-blue-100 text-blue-800'
                  : state.currentUser?.role === 'guest'
                  ? 'bg-gray-100 text-gray-800'
                  : 'bg-green-100 text-green-800'
              }`}>
                {state.currentUser?.role === 'admin'
                  ? 'Admin'
                  : state.currentUser?.role === 'manager'
                  ? 'Werkstattleitung'
                  : ['employee', 'workshop'].includes(state.currentUser?.role || '')
                  ? 'Werkstattmitarbeiter'
                  : state.currentUser?.role === 'guest'
                  ? 'Gast'
                  : 'Auftraggeber'}
              </span>
            </div>
            
            <button
              onClick={handleLogout}
              className="flex items-center space-x-1 text-gray-600 hover:text-red-600 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span className="text-sm">Abmelden</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}