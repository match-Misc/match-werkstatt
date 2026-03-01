import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Settings, CheckCircle, XCircle, Save, Loader2 } from 'lucide-react';

export default function NetworkConfigAdmin() {
  const { state, dispatch } = useApp();
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
          message: 'Verbindungsfehler: ' + result.message 
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
    if (!networkPath) return;
    
    setIsSaving(true);
    try {
      // Send the network path as is - let the server handle normalization
      let pathToSend = networkPath.trim();
      
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
            message: 'Netzwerkpfad wurde erfolgreich gespeichert.',
            type: 'success'
          }
        });
        
        setConnectionStatus({ 
          status: 'success', 
          message: 'Netzwerkpfad konfiguriert und erreichbar' 
        });
        
        // Verbindung testen
        await testNetworkConnection();
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
          message: 'Fehler beim Speichern des Netzwerkpfads: ' + 
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
    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
      <div className="flex items-center mb-4">
        <Settings className="w-5 h-5 text-blue-600 mr-2" />
        <h2 className="text-lg font-medium">Netzwerkordner-Konfiguration</h2>
      </div>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Netzwerkpfad
          </label>
          <div className="flex">
            <input
              type="text"
              value={networkPath}
              onChange={(e) => setNetworkPath(e.target.value)}
              placeholder="\\SERVER\Freigabe\Aufträge oder Z:\Aufträge"
              className="flex-grow px-3 py-2 border border-gray-300 rounded-l-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={testNetworkConnection}
              disabled={connectionStatus.status === 'testing' || !networkPath}
              className="px-3 py-2 bg-gray-100 border border-gray-300 border-l-0 rounded-r-md hover:bg-gray-200 focus:outline-none"
            >
              {connectionStatus.status === 'testing' ? (
                <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
              ) : (
                'Testen'
              )}
            </button>
          </div>
          
          <div className="mt-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Beschreibung (optional)
            </label>
            <input
              type="text"
              value={networkPathDescription}
              onChange={(e) => setNetworkPathDescription(e.target.value)}
              placeholder="z.B. 'Hauptnetzwerkordner für Aufträge'"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            disabled={isSaving || !networkPath}
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
      
      <div className="mt-4 text-sm text-gray-600">
        <p className="font-medium">Hinweise:</p>
        <ul className="list-disc pl-5 mt-1 space-y-1">
          <li>
            Für Windows-Netzwerkpfade, verwende doppelte Backslashes: <code>\\SERVER\Ordner</code>
          </li>
          <li>
            Für gemappte Laufwerke, verwende den Laufwerksbuchstaben: <code>Z:\Ordner</code>
          </li>
          <li>
            Der Server muss Lese- und Schreibzugriff auf diesen Ordner haben
          </li>
        </ul>
      </div>
    </div>
  );
}
