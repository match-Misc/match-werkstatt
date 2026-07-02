import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Settings, CheckCircle, XCircle, Save, Loader2 } from 'lucide-react';

export default function NetworkConfigAdmin() {
  const { state, dispatch } = useApp();
  const [useNetworkDrive, setUseNetworkDrive] = useState(false);
  const [networkPath, setNetworkPath] = useState('');
  const [networkPathDescription, setNetworkPathDescription] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<{
    status: 'idle' | 'testing' | 'success' | 'error';
    message: string;
  }>({ status: 'idle', message: '' });
  const [isSaving, setIsSaving] = useState(false);

  // Beim Laden der Komponente die aktuelle Konfiguration laden
  useEffect(() => {
    const loadConfigs = async () => {
      try {
        const response = await fetch('/api/admin/network-config');
        if (response.ok) {
          const result = await response.json();
          if (result.success && result.networkPath) {
            setNetworkPath(result.networkPath);
            setUseNetworkDrive(true);
            setNetworkPathDescription(result.description || '');
          }
        }
      } catch (error) {
        console.error('Fehler beim Laden der Konfigurationen:', error);
      }
    };
    
    loadConfigs();
  }, [dispatch]);

  const testNetworkConnection = async () => {
    setConnectionStatus({ status: 'testing', message: 'Verbindung wird getestet...' });
    try {
      const response = await fetch('/api/system/network-test');
      const result = await response.json();
      
      if (result.success) {
        setConnectionStatus({ 
          status: 'success', 
          message: 'Verbindung erfolgreich: ' + result.message 
        });
      } else {
        setConnectionStatus({ 
          status: 'error', 
          message: 'Verbindungsfehler: ' + (result.message || result.error || 'Unbekannter Fehler') 
        });
      }
    } catch (error) {
      setConnectionStatus({ 
        status: 'error', 
        message: 'Fehler beim Testen der Verbindung: ' + (error instanceof Error ? error.message : String(error))
      });
    }
  };

  const saveNetworkPath = async () => {
    // Wenn Checkbox nicht markiert, leeren String senden, um es zu deaktivieren
    const pathToSend = useNetworkDrive ? '/app/storage/network' : '';
    
    setIsSaving(true);
    try {
      console.log('Sending network path:', pathToSend);
      
      const response = await fetch('/api/admin/network-config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          networkPath: pathToSend
        }),
      });
      
      const result = await response.json();
      
      if (response.ok && result.success) {
        dispatch({
          type: 'SHOW_NOTIFICATION',
          payload: {
            message: 'Netzwerkkonfiguration wurde erfolgreich gespeichert.',
            type: 'success'
          }
        });
        
        setConnectionStatus({ 
          status: 'success', 
          message: pathToSend ? 'Netzwerkpfad konfiguriert und erreichbar' : 'Netzwerkpfad deaktiviert' 
        });
        
        // Verbindung testen, falls aktiviert
        if (pathToSend) {
          await testNetworkConnection();
        }
      } else {
        // Verwende das bereits geparste result
        let errorMessage = result.error || result.details || 'Fehler beim Speichern';
        console.error('Server error details:', result);
        
        throw new Error(errorMessage);
      }
    } catch (error) {
      dispatch({
        type: 'SHOW_NOTIFICATION',
        payload: {
          message: 'Fehler beim Speichern der Konfiguration: ' + 
            (error instanceof Error ? error.message : String(error)),
          type: 'error'
        }
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Nur für Admin-Benutzer anzeigen
  if (!state.currentUser || state.currentUser.role !== 'admin') {
    return null;
  }

  return (
    <div className="w-full mb-6">
      
      <div className="space-y-4">
        <div>
          <div className="flex items-center mb-4">
            <input
              type="checkbox"
              id="useNetworkDrive"
              checked={useNetworkDrive}
              onChange={(e) => {
                setUseNetworkDrive(e.target.checked);
                setNetworkPath(e.target.checked ? '/app/storage/network' : '');
              }}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="useNetworkDrive" className="ml-2 block text-sm font-medium text-gray-700">
              Netzwerklaufwerk (SMB/CIFS) über Docker verwenden
            </label>
          </div>
          
          {useNetworkDrive && (
            <div className="mb-4">
              <button
                onClick={testNetworkConnection}
                disabled={connectionStatus.status === 'testing'}
                className="px-3 py-2 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none flex items-center text-sm"
              >
                {connectionStatus.status === 'testing' ? (
                  <Loader2 className="w-4 h-4 animate-spin text-blue-600 mr-2" />
                ) : null}
                Verbindung Testen
              </button>
            </div>
          )}
          
          <div className="mt-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Beschreibung (optional)
            </label>
            <input
              type="text"
              value={networkPathDescription}
              onChange={(e) => setNetworkPathDescription(e.target.value)}
              placeholder="z.B. 'Hauptnetzwerkordner für Aufträge'"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              disabled={!useNetworkDrive}
            />
          </div>
          
          {connectionStatus.status !== 'idle' && (
            <div className={`mt-2 flex items-center ${
              connectionStatus.status === 'success' 
                ? 'text-green-600' 
                : connectionStatus.status === 'error'
                  ? 'text-red-600'
                  : 'text-blue-600'
            }`}>
              {connectionStatus.status === 'success' && <CheckCircle className="w-4 h-4 mr-1" />}
              {connectionStatus.status === 'error' && <XCircle className="w-4 h-4 mr-1" />}
              {connectionStatus.status === 'testing' && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              <span className="text-sm">{connectionStatus.message}</span>
            </div>
          )}
        </div>
        
        <div className="flex justify-end">
          <button
            onClick={saveNetworkPath}
            disabled={isSaving}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Speichern...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Speichern
              </>
            )}
          </button>
        </div>
      </div>
      
      <div className="mt-4 text-sm text-gray-600 bg-blue-50 p-4 rounded-md border border-blue-100">
        <p className="font-medium text-blue-800">Hinweise zur Docker-Konfiguration:</p>
        <ul className="list-disc pl-5 mt-2 space-y-2 text-blue-700">
          <li>
            Der Netzwerkordner wird über die <code>.env</code> Datei konfiguriert (SMB_SHARE_PATH, SMB_USERNAME, SMB_PASSWORD).
          </li>
          <li>
            Docker mountet diesen Share automatisch unter <code>/app/storage/network</code> in den Backend-Container.
          </li>
          <li>
            Falls ein anderer Netzwerkpfad gewünscht ist, muss dieser direkt in der <code>docker-compose.yml</code> sowie in der <code>.env</code> Datei angepasst werden.
          </li>
          <li>
            Stelle sicher, dass der angegebene Nutzer Lese- und Schreibzugriff (bzw. die entsprechenden Berechtigungen) auf den freigegebenen Ordner hat.
          </li>
        </ul>
      </div>
    </div>
  );
}
