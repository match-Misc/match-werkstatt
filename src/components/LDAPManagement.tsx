import { useState, useEffect } from 'react';
import { Users, Server, RefreshCw, Settings, UserCheck, Eye, UserX } from 'lucide-react';

interface LDAPUser {
  username: string;
  email?: string;
  displayName?: string;
  localRole?: string;
  lastSync?: string;
}

interface LDAPConfig {
  host: string;
  port: number;
  baseDN: string;
  enabled: boolean;
}

export default function LDAPManagement() {
  const [ldapUsers, setLdapUsers] = useState<LDAPUser[]>([]);
  const [ldapConfig, setLdapConfig] = useState<LDAPConfig | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [testUsername, setTestUsername] = useState('');
  const [testPassword, setTestPassword] = useState('');

  useEffect(() => {
    fetchLdapStatus();
    fetchLdapUsers();
  }, []);

  const fetchLdapStatus = async () => {
    try {
      const res = await fetch('/api/ldap/test');
      const data = await res.json();
      setIsConnected(data.ldapConnected);
      setLdapConfig(data.config);
    } catch (err) {
      console.error('Fehler beim Abrufen des LDAP-Status:', err);
    }
  };

  const fetchLdapUsers = async () => {
    try {
      const res = await fetch('/api/ldap/users');
      if (res.ok) {
        const data = await res.json();
        setLdapUsers(data.users || []);
      }
    } catch (err) {
      console.error('Fehler beim Abrufen der LDAP-Benutzer:', err);
    }
  };

  const testLdapAuth = async () => {
    if (!testUsername || !testPassword) {
      setMessage('Bitte Benutzername und Passwort eingeben');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/ldap/test-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: testUsername, password: testPassword })
      });

      const data = await res.json();
      if (res.ok) {
        setMessage(`✅ LDAP-Test erfolgreich: ${data.user?.displayName || testUsername} (${data.user?.email || 'Keine E-Mail'})`);
      } else {
        setMessage(`❌ LDAP-Test fehlgeschlagen: ${data.message}`);
      }
    } catch (err) {
      setMessage('❌ Fehler beim LDAP-Test');
    } finally {
      setLoading(false);
      setTestUsername('');
      setTestPassword('');
    }
  };

  const syncLdapUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ldap/sync', {
        method: 'POST'
      });

      const data = await res.json();
      if (res.ok) {
        setMessage(`✅ Synchronisation erfolgreich: ${data.synchronized} Benutzer synchronisiert`);
        fetchLdapUsers();
      } else {
        setMessage(`❌ Synchronisation fehlgeschlagen: ${data.message}`);
      }
    } catch (err) {
      setMessage('❌ Fehler bei der Synchronisation');
    } finally {
      setLoading(false);
    }
  };

  const updateUserRole = async (username: string, role: string) => {
    try {
      const res = await fetch(`/api/ldap/users/${username}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role })
      });

      if (res.ok) {
        setMessage(`✅ Rolle für ${username} auf ${role} geändert`);
        fetchLdapUsers();
      } else {
        const data = await res.json();
        setMessage(`❌ Fehler beim Ändern der Rolle: ${data.message}`);
      }
    } catch (err) {
      setMessage('❌ Fehler beim Ändern der Rolle');
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h2 className="text-2xl font-bold mb-6 flex items-center">
        <Server className="w-6 h-6 mr-2" />
        LDAP-Verwaltung
      </h2>

      {/* LDAP-Status */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center">
          <Settings className="w-5 h-5 mr-2" />
          LDAP-Verbindungsstatus
        </h3>
        
        <div className="flex items-center mb-4">
          <div className={`w-3 h-3 rounded-full mr-3 ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
          <span className={`font-medium ${isConnected ? 'text-green-700' : 'text-red-700'}`}>
            {isConnected ? 'Verbunden' : 'Nicht verbunden'}
          </span>
        </div>

        {ldapConfig && (
          <div className="bg-gray-50 p-4 rounded text-sm">
            <div><strong>Host:</strong> {ldapConfig.host}</div>
            <div><strong>Port:</strong> {ldapConfig.port}</div>
            <div><strong>Base DN:</strong> {ldapConfig.baseDN}</div>
          </div>
        )}
      </div>

      {/* LDAP-Test */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center">
          <UserCheck className="w-5 h-5 mr-2" />
          LDAP-Authentifizierung testen
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <input
            type="text"
            placeholder="Benutzername"
            value={testUsername}
            onChange={(e) => setTestUsername(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="password"
            placeholder="Passwort"
            value={testPassword}
            onChange={(e) => setTestPassword(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={testLdapAuth}
            disabled={loading}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
            Testen
          </button>
        </div>

        {message && (
          <div className="mt-4 p-3 bg-gray-50 rounded text-sm">
            {message}
          </div>
        )}
      </div>

      {/* LDAP-Benutzer verwalten */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold flex items-center">
            <Users className="w-5 h-5 mr-2" />
            LDAP-Benutzer ({ldapUsers.length})
          </h3>
          <button
            onClick={syncLdapUsers}
            disabled={loading}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Synchronisieren
          </button>
        </div>

        {ldapUsers.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <UserX className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Keine LDAP-Benutzer gefunden</p>
            <p className="text-sm">Verwenden Sie die Synchronisation, um Benutzer zu importieren</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Benutzername</th>
                  <th className="text-left py-2">E-Mail</th>
                  <th className="text-left py-2">Anzeigename</th>
                  <th className="text-left py-2">Lokale Rolle</th>
                  <th className="text-left py-2">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {ldapUsers.map((user) => (
                  <tr key={user.username} className="border-b hover:bg-gray-50">
                    <td className="py-3 font-medium">{user.username}</td>
                    <td className="py-3">{user.email || '-'}</td>
                    <td className="py-3">{user.displayName || '-'}</td>
                    <td className="py-3">
                      <span className={`px-2 py-1 rounded text-xs ${
                        user.localRole === 'admin' ? 'bg-red-100 text-red-800' :
                        user.localRole === 'workshop' ? 'bg-blue-100 text-blue-800' :
                        user.localRole === 'client' ? 'bg-green-100 text-green-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {user.localRole || 'Keine Rolle'}
                      </span>
                    </td>
                    <td className="py-3">
                      <select
                        value={user.localRole || ''}
                        onChange={(e) => updateUserRole(user.username, e.target.value)}
                        className="text-xs border border-gray-300 rounded px-2 py-1"
                      >
                        <option value="">Keine Rolle</option>
                        <option value="admin">Admin</option>
                        <option value="workshop">Werkstatt</option>
                        <option value="client">Kunde</option>
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
