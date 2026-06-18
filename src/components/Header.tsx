import React from 'react';
import { LogOut, Building2, User } from 'lucide-react';
import { useApp } from '../context/AppContext';

export default function Header() {
  const { state, dispatch } = useApp();

  const handleLogout = () => {
    dispatch({ type: 'LOGOUT' });
  };

  return (
    <header className="bg-white shadow-sm border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <button 
            onClick={() => window.location.href = '/'}
            className="flex items-center hover:opacity-80 transition-opacity"
          >
            <Building2 className="w-8 h-8 text-blue-600 mr-3" />
            <h1 className="text-xl font-bold text-gray-900">Werkstatt-Verwaltung</h1>
          </button>
          
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <User className="w-4 h-4 text-gray-600" />
              <span className="text-sm font-medium text-gray-700">
                {state.currentUser?.name}
              </span>
              <span className={`px-2 py-1 text-xs rounded-full ${
                state.currentUser?.role === 'admin'
                  ? 'bg-purple-100 text-purple-800'
                  : state.currentUser?.role === 'workshop'
                  ? 'bg-blue-100 text-blue-800'
                  : 'bg-green-100 text-green-800'
              }`}>
                {state.currentUser?.role === 'admin'
                  ? 'Admin'
                  : state.currentUser?.role === 'workshop'
                  ? 'Werkstatt'
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