
import { NavLink, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  CheckSquare, 
  Archive, 
  Settings, 
  Users, 
  Menu,
  FileEdit
} from 'lucide-react';
import { useApp } from '../context/AppContext';

interface SidebarProps {
  isExpanded: boolean;
  setIsExpanded: (value: boolean) => void;
}

export default function Sidebar({ isExpanded, setIsExpanded }: SidebarProps) {
  const { state } = useApp();
  const role = state.currentUser?.role || '';
  const location = useLocation();

  // "admin" only items
  const showUserManagement = role === 'admin';
  const isClient = role === 'client';

  // Toggle function
  const handleToggle = () => {
    setIsExpanded(!isExpanded);
  };

  const navItems = [
    { name: 'Auftragsübersicht', icon: LayoutDashboard, path: '/dashboard', section: 'Core' },
    ...(['client', 'admin', 'manager'].includes(role) ? [{ name: 'Entwürfe', icon: FileEdit, path: '/drafts', section: 'Core' }] : []),
    ...(!isClient ? [{ name: 'Unteraufgaben', icon: CheckSquare, path: '/tasks', section: 'Core' }] : []),
    { name: 'Archiv', icon: Archive, path: '/archive', section: 'Core' },
    ...(!isClient ? [{ name: 'Einstellungen', icon: Settings, path: '/settings', section: 'Management' }] : []),
    ...(showUserManagement ? [{ name: 'Benutzerverwaltung', icon: Users, path: '/admin/users', section: 'Management' }] : [])
  ];

  return (
    <div className={`bg-gray-900 text-white transition-all duration-300 flex flex-col relative h-full shrink-0 ${isExpanded ? 'w-64' : 'w-16'}`}>
      {/* Header / Toggle Section */}
      <div className={`flex items-center h-16 border-b border-gray-800 ${isExpanded ? 'px-4 justify-between' : 'justify-center'}`}>
        {isExpanded && <span className="font-bold text-lg truncate">Menü</span>}
        <button
          onClick={handleToggle}
          className="text-gray-400 hover:text-white p-1.5 rounded-md hover:bg-gray-800 transition-colors"
          title={isExpanded ? 'Sidebar einklappen' : 'Sidebar ausklappen'}
        >
          <Menu className="w-6 h-6" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-4">
        {/* Core Operations Section */}
        <div className="mb-6">
          {isExpanded && <p className="px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Core Operations</p>}
          <nav className="space-y-1">
            {navItems.filter(item => item.section === 'Core').map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={`flex items-center px-4 py-3 text-sm transition-colors ${
                    isActive ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                  }`}
                  title={!isExpanded ? item.name : undefined}
                >
                  <Icon className={`w-5 h-5 flex-shrink-0 ${isExpanded ? 'mr-3' : 'mx-auto'}`} />
                  {isExpanded && <span>{item.name}</span>}
                </NavLink>
              );
            })}
          </nav>
        </div>

        {/* Management & Preferences Section */}
        {navItems.some(item => item.section === 'Management') && (
          <div>
            {isExpanded && <p className="px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Management</p>}
            <nav className="space-y-1">
              {navItems.filter(item => item.section === 'Management').map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={`flex items-center px-4 py-3 text-sm transition-colors ${
                      isActive ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                    }`}
                    title={!isExpanded ? item.name : undefined}
                  >
                    <Icon className={`w-5 h-5 flex-shrink-0 ${isExpanded ? 'mr-3' : 'mx-auto'}`} />
                    {isExpanded && <span>{item.name}</span>}
                  </NavLink>
                );
              })}
            </nav>
          </div>
        )}
      </div>
    </div>
  );
}
