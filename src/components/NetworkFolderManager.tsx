import { useState, useEffect } from 'react';
import { 
  Folder, 
  FolderPlus, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  RefreshCw,
  Settings,
  Server,
  Info
} from 'lucide-react';

interface NetworkConfig {
  configured: boolean;
  basePath: string;
  accessible: boolean;
  message: string;
}

interface NetworkFolderStatus {
  configured: boolean;
  exists: boolean;
  path: string | null;
  basePath: string;
  orderNumber: string;
  message: string;
}

interface NetworkFolderManagerProps {
  orderId: string;
  orderNumber: string;
  onClose?: () => void;
}

export default function NetworkFolderManager({ orderId, orderNumber, onClose }: NetworkFolderManagerProps) {
  const [config, setConfig] = useState<NetworkConfig | null>(null);
  const [folderStatus, setFolderStatus] = useState<NetworkFolderStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadConfig();
    loadFolderStatus();
  }, [orderId]);

  const loadConfig = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/admin/network-config');
      if (response.ok) {
        const data = await response.json();
        setConfig(data);
      }
    } catch (error) {
      console.error('Fehler beim Laden der Konfiguration:', error);
    }
  };

  const loadFolderStatus = async () => {
    try {
      setLoading(true);
      const response = await fetch(`http://localhost:3001/api/orders/${orderId}/network-folder-status`);
      if (response.ok) {
        const data = await response.json();
        setFolderStatus(data);
      }
    } catch (error) {
      console.error('Fehler beim Laden des Ordner-Status:', error);
    } finally {
      setLoading(false);
    }
  };

  const createNetworkFolder = async () => {
    try {
      setCreating(true);
      const response = await fetch(`http://localhost:3001/api/orders/${orderId}/create-network-folder`, {
        method: 'POST'
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        alert(`Netzwerkordner erfolgreich erstellt!\nPfad: ${data.path}`);
        await loadFolderStatus(); // Status neu laden
      } else {
        alert(`Fehler beim Erstellen des Netzwerkordners:\n${data.error || data.message}`);
      }
    } catch (error) {
      console.error('Fehler beim Erstellen des Netzwerkordners:', error);
      alert('Netzwerkfehler beim Erstellen des Ordners');
    } finally {
      setCreating(false);
    }
  };

  const getStatusIcon = () => {
    if (!config || !folderStatus) return <Settings className="w-6 h-6 text-gray-400" />;
    
    if (!config.configured) {
      return <AlertTriangle className="w-6 h-6 text-yellow-500" />;
    }
    
    if (!config.accessible) {
      return <XCircle className="w-6 h-6 text-red-500" />;
    }
    
    if (folderStatus.exists) {
      return <CheckCircle className="w-6 h-6 text-green-500" />;
    }
    
    return <Folder className="w-6 h-6 text-blue-500" />;
  };

  const getStatusMessage = () => {
    if (!config || !folderStatus) return 'Lade Status...';
    
    if (!config.configured) {
      return 'Netzwerkpfad nicht konfiguriert';
    }
    
    if (!config.accessible) {
      return 'Netzwerkpfad nicht erreichbar';
    }
    
    return folderStatus.message;
  };

  const getStatusColor = () => {
    if (!config || !folderStatus) return 'text-gray-600';
    
    if (!config.configured || !config.accessible) {
      return 'text-red-600';
    }
    
    if (folderStatus.exists) {
      return 'text-green-600';
    }
    
    return 'text-blue-600';
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center">
          <Server className="w-6 h-6 text-blue-600 mr-3" />
          <div>
            <h2 className="text-xl font-bold text-gray-900">Netzwerkordner</h2>
            <p className="text-gray-600">Auftrag: {orderNumber}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadFolderStatus}
            disabled={loading}
            className="p-2 text-gray-600 hover:text-gray-800 transition-colors"
            title="Status aktualisieren"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="px-3 py-1 text-gray-600 hover:text-gray-800 transition-colors"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Status Overview */}
      <div className="bg-gray-50 rounded-lg p-4 mb-6">
        <div className="flex items-start">
          <div className="mr-3 mt-1">
            {getStatusIcon()}
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900 mb-1">Status</h3>
            <p className={`text-sm ${getStatusColor()}`}>
              {getStatusMessage()}
            </p>
            {folderStatus?.path && (
              <p className="text-xs text-gray-500 mt-1 font-mono break-all">
                {folderStatus.path}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Configuration Info */}
      {config && (
        <div className="mb-6">
          <h3 className="font-semibold text-gray-900 mb-3">Konfiguration</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Netzwerkpfad:</span>
              <span className={`font-mono ${config.configured ? 'text-gray-900' : 'text-yellow-600'}`}>
                {config.basePath}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Konfiguriert:</span>
              <span className={config.configured ? 'text-green-600' : 'text-red-600'}>
                {config.configured ? 'Ja' : 'Nein'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Erreichbar:</span>
              <span className={config.accessible ? 'text-green-600' : 'text-red-600'}>
                {config.accessible ? 'Ja' : 'Nein'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3">
        {config?.configured && config?.accessible && !folderStatus?.exists && (
          <button
            onClick={createNetworkFolder}
            disabled={creating}
            className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors flex items-center justify-center"
          >
            <FolderPlus className="w-4 h-4 mr-2" />
            {creating ? 'Erstelle Ordner...' : 'Netzwerkordner erstellen'}
          </button>
        )}
        
        {folderStatus?.exists && (
          <button
            className="flex-1 bg-green-100 text-green-800 px-4 py-2 rounded-lg cursor-default flex items-center justify-center"
          >
            <CheckCircle className="w-4 h-4 mr-2" />
            Ordner vorhanden
          </button>
        )}
      </div>

      {/* Help Text */}
      <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
        <div className="flex items-start">
          <Info className="w-5 h-5 text-blue-600 mr-2 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">Netzwerkordner-Funktionalität</p>
            {!config?.configured ? (
              <p>
                Der Netzwerkpfad muss über die Umgebungsvariable <code>NETWORK_BASE_PATH</code> 
                konfiguriert werden. Beispiel: <code>\\\\server\\auftraege</code>
              </p>
            ) : !config?.accessible ? (
              <p>
                Der konfigurierte Netzwerkpfad ist nicht erreichbar. Bitte prüfen Sie die 
                Serververbindung und Berechtigungen.
              </p>
            ) : folderStatus?.exists ? (
              <p>
                Der Netzwerkordner für diesen Auftrag existiert bereits und kann von 
                Arbeitsplätzen aus genutzt werden.
              </p>
            ) : (
              <p>
                Erstellen Sie den Netzwerkordner, um eine strukturierte Dateiverwaltung 
                für diesen Auftrag zu ermöglichen.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Folder Structure Preview */}
      {(config?.configured || folderStatus?.exists) && (
        <div className="mt-4 p-4 bg-gray-50 rounded-lg">
          <h4 className="font-medium text-gray-900 mb-2 text-sm">Ordnerstruktur</h4>
          <div className="text-xs text-gray-600 font-mono space-y-1">
            <div>📁 {orderNumber}/</div>
            <div className="ml-4">📁 CAM-Dateien/</div>
            <div className="ml-4">📁 Zeichnungen/</div>
            <div className="ml-4">📁 Dokumentation/</div>
            <div className="ml-4">📁 Fotos/</div>
            <div className="ml-4">📁 Archiv/</div>
          </div>
        </div>
      )}
    </div>
  );
}
