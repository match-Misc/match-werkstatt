import React, { useState, useEffect } from 'react';
import { LogIn, Building2, UserPlus, Wifi, WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../context/AppContext';
import ClientRegistration from './ClientRegistration';

interface LDAPStatus {
  ldapConnected: boolean;
  config?: {
    host: string;
    port: number;
    baseDN: string;
  };
}

export default function Login() {
  const { dispatch } = useApp();
  const { t, i18n } = useTranslation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showRegistration, setShowRegistration] = useState(false);
  const [ldapStatus, setLdapStatus] = useState<LDAPStatus | null>(null);

  // LDAP-Status beim Laden überprüfen
  useEffect(() => {
    const checkLdapStatus = async () => {
      try {
        const res = await fetch('/api/ldap/test');
        if (res.ok) {
          const data = await res.json();
          setLdapStatus({
            ldapConnected: data.ldapConnected,
            config: data.config
          });
        }
      } catch (err) {
        console.log('LDAP-Status konnte nicht abgerufen werden');
      }
    };

    checkLdapStatus();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      
      if (!res.ok) {
        if (res.status === 403) {
          setError('Account noch nicht bestätigt');
        } else {
          const errorData = await res.json();
          setError(errorData.message || 'Ungültige Anmeldedaten oder Account nicht gefunden');
        }
        return;
      }
      
      const data = await res.json();
      console.log('Login erfolgreich via:', data.authSource);
      dispatch({ type: 'LOGIN', payload: data.user });
    } catch (err) {
      setError('Serverfehler beim Login');
    }
  };

  if (showRegistration) {
    return <ClientRegistration onClose={() => setShowRegistration(false)} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md relative">
        <div className="absolute top-4 right-4">
          <select 
            value={i18n.language} 
            onChange={(e) => {
              const lang = e.target.value;
              i18n.changeLanguage(lang);
            }}
            className="text-sm bg-transparent border border-gray-200 rounded text-gray-600 cursor-pointer focus:ring-0"
          >
            <option value="de">DE</option>
            <option value="en">EN</option>
          </select>
        </div>
        <div className="text-center mb-8">
          <div className="bg-blue-600 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <Building2 className="text-white w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{t('login.title', 'Werkstatt-Verwaltung')}</h1>
          <p className="text-gray-600 mt-2">{t('login.subtitle', 'Bitte melden Sie sich an')}</p>
          
          {/* LDAP-Status-Anzeige */}
          {ldapStatus && (
            <div className="mt-4 flex items-center justify-center">
              <div 
                className="flex items-center space-x-2 px-3 py-1 rounded"
              >
                {ldapStatus.ldapConnected ? (
                  <Wifi className="h-4 w-4 text-green-600" />
                ) : (
                  <WifiOff className="h-4 w-4 text-gray-400" />
                )}
                <span className={`text-xs ${ldapStatus.ldapConnected ? 'text-green-600' : 'text-gray-400'}`}>
                  {ldapStatus.ldapConnected ? t('login.ldapConnected', 'LDAP verbunden') : t('login.ldapDisconnected', 'LDAP nicht verfügbar')}
                </span>
              </div>
            </div>
          )}
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
              {t('login.username', 'Benutzername')}
            </label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder={t('login.usernamePlaceholder', 'Benutzername eingeben')}
              required
            />
          </div>
          
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              {t('login.password', 'Passwort')}
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder={t('login.passwordPlaceholder', 'Passwort eingeben')}
              required
            />
          </div>

          {error && (
            <div className="text-red-600 text-sm bg-red-50 p-2 rounded">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center"
          >
            <LogIn className="w-4 h-4 mr-2" />
            {t('login.submit', 'Anmelden')}
          </button>

          <button
            type="button"
            onClick={() => setShowRegistration(true)}
            className="w-full bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center mt-2"
          >
            <UserPlus className="w-4 h-4 mr-2" />
            {t('login.createAccount', 'Neuen Account erstellen')}
          </button>
        </form>
      </div>
    </div>
  );
}