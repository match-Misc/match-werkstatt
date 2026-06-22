import React, { useEffect, useState } from 'react';
import { ShieldAlert, Check } from 'lucide-react';
import { useApp } from '../context/AppContext';

interface User {
  id: string;
  username: string;
  email?: string;
  name: string;
  role: 'guest' | 'client' | 'employee' | 'manager' | 'admin';
  createdAt: string;
  authSource?: string;
}

export default function UserManagement() {
  const { state, dispatch } = useApp();
  const viewerRole = state.currentUser?.role || '';
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/users?viewerRole=${encodeURIComponent(viewerRole)}`);
      if (!res.ok) throw new Error('Fehler beim Laden der Benutzer');
      const data = await res.json();
      setUsers(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      setError(null);
      setSuccess(null);
      const res = await fetch(`/api/users/${userId}/role?viewerRole=${encodeURIComponent(viewerRole)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || data.message || 'Fehler beim Ändern der Rolle');
      }
      setSuccess('Rolle erfolgreich aktualisiert');
      if (userId === state.currentUser?.id || userId === state.currentUser?.username) {
        dispatch({ type: 'UPDATE_CURRENT_USER', payload: { role: newRole as any } });
      }
      fetchUsers(); // Refresh
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">Benutzerverwaltung</h2>
        <p className="text-gray-600 mt-1">Verwalten Sie Rollen und Berechtigungen der Benutzer.</p>
      </div>

      <div className="bg-white rounded-lg shadow-sm border p-6">
        {error && (
          <div className="mb-4 bg-red-50 border-l-4 border-red-400 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <ShieldAlert className="h-5 w-5 text-red-400" />
              </div>
              <div className="ml-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          </div>
        )}

        {success && (
          <div className="mb-4 bg-green-50 border-l-4 border-green-400 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <Check className="h-5 w-5 text-green-400" />
              </div>
              <div className="ml-3">
                <p className="text-sm text-green-700">{success}</p>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center p-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <div className="overflow-x-auto border rounded-lg">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name / Username</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Auth Source</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Registriert am</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rolle</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{user.name}</div>
                      <div className="text-sm text-gray-500">{user.username}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {user.email || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {user.authSource || 'local'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {user.createdAt ? new Date(user.createdAt).toLocaleDateString('de-DE') : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <select
                        value={user.role}
                        onChange={(e) => handleRoleChange(user.id, e.target.value)}
                        className={`mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-purple-500 focus:border-purple-500 sm:text-sm rounded-md ${
                          user.role === 'admin' ? 'bg-purple-50 text-purple-800 border-purple-200' :
                          user.role === 'guest' ? 'bg-gray-50 text-gray-600 border-gray-200' :
                          user.role === 'client' ? 'bg-green-50 text-green-800 border-green-200' :
                          'bg-blue-50 text-blue-800 border-blue-200'
                        }`}
                      >
                        <option value="guest">Gast</option>
                        <option value="client">Auftraggeber</option>
                        <option value="employee">Werkstattmitarbeiter</option>
                        <option value="manager">Werkstattleitung</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
