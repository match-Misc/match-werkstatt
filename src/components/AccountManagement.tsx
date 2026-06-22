import { Server } from 'lucide-react';
import { useApp } from '../context/AppContext';
import NetworkConfigAdmin from './NetworkConfigAdmin';
import LDAPManagement from './LDAPManagement';
import MaterialManagement from './MaterialManagement';

export default function AccountManagement() {
  const { state } = useApp();

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="flex justify-between items-center p-6 border-b">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Einstellungen</h2>
            <p className="text-gray-600 mt-1">Systemeinstellungen verwalten</p>
          </div>
        </div>

        {/* Netzwerkkonfiguration (nur für Admins sichtbar) */}
        {state.currentUser?.role === 'admin' ? (
          <div className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Systemkonfiguration</h3>
            <NetworkConfigAdmin />
            
            <div className="mt-6 pt-6 border-t">
              <h4 className="text-md font-semibold text-gray-900 mb-4 flex items-center">
                <Server className="w-4 h-4 mr-2" />
                LDAP-Verwaltung
              </h4>
              <LDAPManagement />
            </div>

            <div className="mt-6 pt-6 border-t">
              <MaterialManagement />
            </div>
          </div>
        ) : (
          <div className="p-6">
            <p className="text-gray-500">Sie haben keine Berechtigung, diese Einstellungen zu sehen.</p>
          </div>
        )}
      </div>
    </div>
  );
}