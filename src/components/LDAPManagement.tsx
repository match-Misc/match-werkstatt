import { useState, useEffect } from 'react';

interface LDAPConfig {
  host: string;
  port: number;
  baseDN: string;
  enabled: boolean;
}

export default function LDAPManagement() {
  const [ldapConfig, setLdapConfig] = useState<LDAPConfig | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    fetchLdapStatus();
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

  return (
    <div className="w-full">
      <div className="flex items-center mb-4">
        <div className={`w-3 h-3 rounded-full mr-3 ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
        <span className={`font-medium ${isConnected ? 'text-green-700' : 'text-red-700'}`}>
          {isConnected ? 'Verbunden' : 'Nicht verbunden'}
        </span>
      </div>

      {ldapConfig && (
        <div className="bg-gray-50 p-4 rounded text-sm w-full md:w-1/2">
          <div><strong>Host:</strong> {ldapConfig.host}</div>
          <div><strong>Port:</strong> {ldapConfig.port}</div>
          <div><strong>Base DN:</strong> {ldapConfig.baseDN}</div>
        </div>
      )}
    </div>
  );
}
