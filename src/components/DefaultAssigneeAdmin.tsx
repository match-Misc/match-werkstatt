import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { UserPlus, Save, Loader2 } from 'lucide-react';
import type { User } from '../types';

export default function DefaultAssigneeAdmin() {
  const { dispatch } = useApp();
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        
        // Fetch users
        const usersRes = await fetch('/api/users');
        if (usersRes.ok) {
          const usersData = await usersRes.json();
          // Filter out clients and guests
          const assignableUsers = usersData.filter((u: User) => 
            ['admin', 'manager', 'employee'].includes(u.role)
          );
          setUsers(assignableUsers);
        }

        // Fetch config
        const configRes = await fetch('/api/admin/default-assignee');
        if (configRes.ok) {
          const configData = await configRes.json();
          if (configData && configData.userId) {
            setSelectedUserId(configData.userId);
          }
        }
      } catch (err) {
        console.error('Fehler beim Laden der Standard-Zuweisung:', err);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchData();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/admin/default-assignee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selectedUserId || null })
      });
      
      const result = await res.json();
      
      if (res.ok && result.success) {
        dispatch({
          type: 'SHOW_NOTIFICATION',
          payload: { message: 'Standard-Zuweisung erfolgreich gespeichert', type: 'success' }
        });
      } else {
        throw new Error(result.error || 'Fehler beim Speichern');
      }
    } catch (err) {
      dispatch({
        type: 'SHOW_NOTIFICATION',
        payload: { 
          message: err instanceof Error ? err.message : 'Fehler beim Speichern der Standard-Zuweisung', 
          type: 'error' 
        }
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-48">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h3 className="text-lg font-medium text-gray-900 mb-2 flex items-center">
          <UserPlus className="w-5 h-5 mr-2 text-blue-600" />
          Standard-Zuweisung für neue Aufträge
        </h3>
        <p className="text-sm text-gray-500">
          Wähle einen Benutzer aus, der standardmäßig neuen Aufträgen zugewiesen wird.
        </p>
      </div>

      <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 mb-6">
        <label htmlFor="defaultAssignee" className="block text-sm font-medium text-gray-700 mb-2">
          Zugewiesener Benutzer
        </label>
        <select
          id="defaultAssignee"
          value={selectedUserId}
          onChange={(e) => setSelectedUserId(e.target.value)}
          className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="">Niemand (leer lassen)</option>
          {users.map(user => (
            <option key={user.id} value={user.id}>
              {user.name} ({user.username}) - {user.role === 'admin' ? 'Administrator' : user.role === 'manager' ? 'Werkstattleitung' : 'Werkstattmitarbeiter'}
            </option>
          ))}
        </select>
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center disabled:opacity-50"
        >
          {isSaving ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          Speichern
        </button>
      </div>
    </div>
  );
}
