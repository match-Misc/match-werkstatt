import { useState, useEffect } from 'react';
import { FolderOpen, AlertCircle, CheckCircle, FolderPlus, Loader2, Upload } from 'lucide-react';
import { useApp } from '../context/AppContext';

interface NetworkFolderStatusProps {
  orderId: string;
  orderNumber?: string;
}

interface NetworkFolderStatus {
  success: boolean;
  orderNumber?: string;
  networkPath?: string;
  potentialPath?: string;
  exists: boolean;
  canCreate?: boolean;
  message: string;
}

export default function NetworkFolderStatus({ orderId, orderNumber }: NetworkFolderStatusProps) {
  const { dispatch } = useApp();
  const [status, setStatus] = useState<NetworkFolderStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [migratingFiles, setMigratingFiles] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`http://localhost:3001/api/orders/${orderId}/network-folder`);
      if (!response.ok) {
        throw new Error('Fehler beim Laden des Ordnerstatus');
      }
      
      const data = await response.json();
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
    } finally {
      setLoading(false);
    }
  };

  const createNetworkFolder = async () => {
    setCreating(true);
    setError(null);
    
    try {
      const response = await fetch(`http://localhost:3001/api/orders/${orderId}/network-folder`, {
        method: 'POST'
      });
      
      if (!response.ok) {
        throw new Error('Fehler beim Erstellen des Netzwerkordners');
      }
      
      const result = await response.json();
      
      if (result.success) {
        // Status neu laden
        await fetchStatus();
      } else {
        throw new Error(result.message || 'Fehler beim Erstellen des Ordners');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
    } finally {
      setCreating(false);
    }
  };

  // Funktion zum Migrieren von Dateien
  const migrateFiles = async () => {
    setMigratingFiles(true);
    setError(null);
    
    try {
      const response = await fetch(`http://localhost:3001/api/orders/${orderId}/migrate-files`, {
        method: 'POST'
      });
      
      if (!response.ok) {
        throw new Error('Fehler beim Migrieren der Dateien');
      }
      
      const result = await response.json();
      
      if (result.success) {
        // Status neu laden
        fetchStatus();
        
        // Benachrichtigung anzeigen
        const migratedCount = result.migrationResult?.migratedFiles || 0;
        const fileTypes = result.migrationResult?.fileTypes || {};
        
        // Erstelle eine schöne Zusammenfassung der migrierten Dateitypen
        let typesSummary = '';
        if (Object.keys(fileTypes).length > 0) {
          typesSummary = Object.entries(fileTypes)
            .map(([type, count]) => `${count} in ${type}`)
            .join(', ');
        }
        
        dispatch({
          type: 'SHOW_NOTIFICATION',
          payload: {
            message: `${migratedCount} Datei(en) erfolgreich migriert${typesSummary ? ` (${typesSummary})` : ''}`,
            type: 'success'
          }
        });
      } else {
        throw new Error(result.error || 'Unbekannter Fehler');
      }
    } catch (err) {
      console.error('Fehler beim Migrieren der Dateien:', err);
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
      
      dispatch({
        type: 'SHOW_NOTIFICATION',
        payload: {
          message: `Fehler beim Migrieren der Dateien: ${err instanceof Error ? err.message : 'Unbekannter Fehler'}`,
          type: 'error'
        }
      });
    } finally {
      setMigratingFiles(false);
    }
  };

  useEffect(() => {
    if (orderId) {
      fetchStatus();
    }
  }, [orderId]);

  if (loading) {
    return (
      <div className="flex items-center space-x-2 text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Lade Netzwerkordner-Status...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center space-x-2 text-red-500">
        <AlertCircle className="w-4 h-4" />
        <span>{error}</span>
      </div>
    );
  }

  if (!status) {
    return null;
  }

  // Status: Ordner existiert
  if (status.exists && status.networkPath) {
    return (
      <div className="rounded-md border border-green-100 bg-green-50 p-3">
        <div className="flex">
          <div className="flex-shrink-0">
            <CheckCircle className="h-5 w-5 text-green-600" />
          </div>
          <div className="ml-3 flex-grow">
            <h3 className="text-sm font-medium text-green-700">Netzwerkordner verfügbar</h3>
            <div className="mt-2 text-sm text-green-700">
              <p className="font-mono text-xs">{status.networkPath}</p>
            </div>
            <div className="mt-2">
              <button
                onClick={migrateFiles}
                disabled={migratingFiles}
                className="inline-flex items-center rounded-md border border-transparent bg-green-600 px-3 py-1 text-xs font-medium text-white shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
              >
                {migratingFiles ? (
                  <>
                    <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                    Migriere Dateien...
                  </>
                ) : (
                  <>
                    <Upload className="mr-1.5 h-3 w-3" />
                    Dateien in Ordner migrieren
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Status: Ordner existiert nicht, aber kann erstellt werden
  if (!status.exists && status.canCreate) {
    return (
      <div className="rounded-md border border-yellow-100 bg-yellow-50 p-3">
        <div className="flex">
          <div className="flex-shrink-0">
            <FolderOpen className="h-5 w-5 text-yellow-600" />
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-yellow-700">Netzwerkordner nicht erstellt</h3>
            <div className="mt-2 text-sm text-yellow-700">
              <p>Der Netzwerkordner wurde noch nicht erstellt. Pfad wäre:</p>
              <p className="font-mono text-xs mt-1">{status.potentialPath}</p>
            </div>
            <div className="mt-2">
              <button
                onClick={createNetworkFolder}
                disabled={creating}
                className="inline-flex items-center rounded-md border border-transparent bg-yellow-600 px-3 py-1 text-xs font-medium text-white shadow-sm hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2"
              >
                {creating ? (
                  <>
                    <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                    Erstelle...
                  </>
                ) : (
                  <>
                    <FolderPlus className="mr-1.5 h-3 w-3" />
                    Ordner erstellen
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Status: Netzwerkpfad nicht konfiguriert
  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
      <div className="flex">
        <div className="flex-shrink-0">
          <AlertCircle className="h-5 w-5 text-gray-400" />
        </div>
        <div className="ml-3">
          <h3 className="text-sm font-medium text-gray-700">Netzwerkordner nicht verfügbar</h3>
          <div className="mt-2 text-sm text-gray-500">
            <p>{status.message || 'Der Netzwerkpfad ist nicht konfiguriert.'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
