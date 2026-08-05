import { useState } from 'react';
import { Settings, ShieldAlert, Box, Briefcase, UserCheck } from 'lucide-react';
import { useApp } from '../context/AppContext';
import NetworkConfigAdmin from './NetworkConfigAdmin';
import MaterialManagement from './MaterialManagement';
import FileTypeRestrictionAdmin from './FileTypeRestrictionAdmin';
import CostCenterManagement from './CostCenterManagement';
import DefaultAssigneeAdmin from './DefaultAssigneeAdmin';

export default function AccountManagement() {
  const { state } = useApp();
  const [activeTab, setActiveTab] = useState<'material' | 'filetypes' | 'network' | 'costcenter' | 'defaultassignee'>('material');

  const isAdminOrManager = state.currentUser?.role === 'admin' || state.currentUser?.role === 'manager';

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="flex justify-between items-center p-6 border-b">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Einstellungen</h2>
            <p className="text-gray-600 mt-1">Systemeinstellungen verwalten</p>
          </div>
        </div>

        {isAdminOrManager ? (
          <div>
            <div className="border-b border-gray-200">
              <nav className="-mb-px flex space-x-8 px-6 overflow-x-auto" aria-label="Tabs">
                <button
                  onClick={() => setActiveTab('material')}
                  className={`${
                    activeTab === 'material'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
                >
                  <Box className="w-4 h-4 mr-2" />
                  Materialverwaltung
                </button>
                <button
                  onClick={() => setActiveTab('filetypes')}
                  className={`${
                    activeTab === 'filetypes'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
                >
                  <ShieldAlert className="w-4 h-4 mr-2" />
                  Dateityp-Filterung
                </button>
                <button
                  onClick={() => setActiveTab('network')}
                  className={`${
                    activeTab === 'network'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
                >
                  <Settings className="w-4 h-4 mr-2" />
                  Netzwerkordner
                </button>
                <button
                  onClick={() => setActiveTab('costcenter')}
                  className={`${
                    activeTab === 'costcenter'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
                >
                  <Briefcase className="w-4 h-4 mr-2" />
                  Kostenstellen
                </button>
                <button
                  onClick={() => setActiveTab('defaultassignee')}
                  className={`${
                    activeTab === 'defaultassignee'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
                >
                  <UserCheck className="w-4 h-4 mr-2" />
                  Standard-Zuweisung
                </button>
              </nav>
            </div>

            <div className="p-6">
              {activeTab === 'material' && (
                <div>
                  <MaterialManagement />
                </div>
              )}
              {activeTab === 'filetypes' && (
                <div>
                  <FileTypeRestrictionAdmin />
                </div>
              )}
              {activeTab === 'network' && (
                <div>
                  <NetworkConfigAdmin />
                </div>
              )}
              {activeTab === 'costcenter' && (
                <div>
                  <CostCenterManagement />
                </div>
              )}
              {activeTab === 'defaultassignee' && (
                <div>
                  <DefaultAssigneeAdmin />
                </div>
              )}
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