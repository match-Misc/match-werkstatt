import { useState, useEffect } from 'react';
import { 
  CheckCircle, 
  XCircle, 
  Upload, 
  Download, 
  RefreshCw, 
  AlertTriangle, 
  File, 
  Clock,
  Undo2,
  ExternalLink
} from 'lucide-react';

interface MigrationFile {
  id: string;
  name: string;
  migrated: boolean;
  migratedAt?: string;
  currentUrl: string;
  originalUrl: string;
}

interface MigrationStatus {
  totalFiles: number;
  migratedFiles: number;
  pendingFiles: number;
  files: MigrationFile[];
}

interface FilesMigrationStatusProps {
  orderId: string;
  onStatusChange?: (status: MigrationStatus) => void;
  hideIfComplete?: boolean; // Neues Prop: Verstecke wenn alles migriert
  hideIfNoFiles?: boolean;  // Neues Prop: Verstecke wenn keine Dateien
}

export default function FilesMigrationStatus({ orderId, onStatusChange, hideIfComplete = false, hideIfNoFiles = false }: FilesMigrationStatusProps) {
  const [migrationStatus, setMigrationStatus] = useState<MigrationStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [migrating, setMigrating] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);

  const fetchMigrationStatus = async () => {
    if (!orderId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/orders/${orderId}/migration-status`);
      if (!response.ok) {
        throw new Error('Fehler beim Laden des Migrationsstatus');
      }
      
      const status = await response.json();
      setMigrationStatus(status);
      
      if (onStatusChange) {
        onStatusChange(status);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
    } finally {
      setLoading(false);
    }
  };

  const migrateFiles = async () => {
    setMigrating(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/orders/${orderId}/migrate-files`, {
        method: 'POST'
      });
      
      if (!response.ok) {
        throw new Error('Fehler beim Migrieren der Dateien');
      }
      
      await response.json();
      
      // Status nach Migration neu laden
      await fetchMigrationStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Migrieren der Dateien');
    } finally {
      setMigrating(false);
    }
  };

  const rollbackMigration = async () => {
    setRollingBack(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/orders/${orderId}/rollback-migration`, {
        method: 'POST'
      });
      
      if (!response.ok) {
        throw new Error('Fehler beim Zurücksetzen der Migration');
      }
      
      await response.json();
      
      // Status nach Rollback neu laden
      await fetchMigrationStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Zurücksetzen der Migration');
    } finally {
      setRollingBack(false);
    }
  };

  useEffect(() => {
    fetchMigrationStatus();
  }, [orderId]);

  if (loading && !migrationStatus) {
    return (
      <div className="flex items-center space-x-2 text-gray-500 p-4">
        <RefreshCw className="w-4 h-4 animate-spin" />
        <span>Lade Migrationsstatus...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4">
        <div className="flex items-center space-x-2 text-red-700">
          <XCircle className="w-5 h-5" />
          <span className="font-medium">Fehler:</span>
          <span>{error}</span>
        </div>
        <button
          onClick={fetchMigrationStatus}
          className="mt-2 text-sm text-red-600 hover:text-red-800 underline"
        >
          Erneut versuchen
        </button>
      </div>
    );
  }

  if (!migrationStatus) {
    return null;
  }

  const { totalFiles, migratedFiles, pendingFiles, files } = migrationStatus;
  const migrationProgress = totalFiles > 0 ? (migratedFiles / totalFiles) * 100 : 0;

  // Verstecke Komponente wenn hideIfNoFiles und keine Dateien vorhanden
  if (hideIfNoFiles && totalFiles === 0) {
    return null;
  }

  // Verstecke Komponente wenn hideIfComplete und alles migriert
  if (hideIfComplete && pendingFiles === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Übersicht */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900">Datei-Migration</h3>
          <button
            onClick={fetchMigrationStatus}
            className="text-gray-400 hover:text-gray-600"
            title="Aktualisieren"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="mb-4">
          <div className="flex justify-between text-sm text-gray-600 mb-1">
            <span>Fortschritt</span>
            <span>{migratedFiles} von {totalFiles} Dateien</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className={`h-2 rounded-full transition-all duration-300 ${
                migrationProgress === 100 ? 'bg-green-500' : 'bg-blue-500'
              }`}
              style={{ width: `${migrationProgress}%` }}
            ></div>
          </div>
        </div>

        {/* Status */}
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="flex flex-col items-center">
            <div className="text-2xl font-bold text-gray-900">{totalFiles}</div>
            <div className="text-sm text-gray-500">Gesamt</div>
          </div>
          <div className="flex flex-col items-center">
            <div className="text-2xl font-bold text-green-600">{migratedFiles}</div>
            <div className="text-sm text-gray-500">Migriert</div>
          </div>
          <div className="flex flex-col items-center">
            <div className="text-2xl font-bold text-orange-600">{pendingFiles}</div>
            <div className="text-sm text-gray-500">Ausstehend</div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex space-x-2 mt-4">
          {pendingFiles > 0 && (
            <button
              onClick={migrateFiles}
              disabled={migrating}
              className="flex-1 inline-flex items-center justify-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            >
              {migrating ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Migriere...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  {migratedFiles > 0 ? 'Verbleibende migrieren' : 'Alle migrieren'}
                </>
              )}
            </button>
          )}
          
          {migratedFiles > 0 && (
            <button
              onClick={rollbackMigration}
              disabled={rollingBack}
              className="flex-1 inline-flex items-center justify-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
            >
              {rollingBack ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Setze zurück...
                </>
              ) : (
                <>
                  <Undo2 className="w-4 h-4 mr-2" />
                  Migration zurücksetzen
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Datei-Liste */}
      {files.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
            <h4 className="text-sm font-medium text-gray-900">Dateien Details</h4>
          </div>
          
          <div className="divide-y divide-gray-200 max-h-64 overflow-y-auto">
            {files.map((file) => (
              <div key={file.id} className="px-4 py-3 flex items-center justify-between">
                <div className="flex items-center space-x-3 flex-1 min-w-0">
                  <div className={`p-1 rounded ${
                    file.migrated 
                      ? 'bg-green-100 text-green-600' 
                      : 'bg-gray-100 text-gray-400'
                  }`}>
                    {file.migrated ? <CheckCircle className="w-4 h-4" /> : <File className="w-4 h-4" />}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {file.name}
                    </div>
                    {file.migrated && file.migratedAt && (
                      <div className="flex items-center text-xs text-gray-500 mt-1">
                        <Clock className="w-3 h-3 mr-1" />
                        Migriert: {new Date(file.migratedAt).toLocaleDateString('de-DE', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  {file.migrated && (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      <ExternalLink className="w-3 h-3 mr-1" />
                      Netzwerk
                    </span>
                  )}
                  
                  <a
                    href={`/api/documents/${file.id}`}
                    className="text-blue-600 hover:text-blue-800"
                    title="Herunterladen"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hinweis */}
      {migratedFiles > 0 && pendingFiles === 0 && (
        <div className="rounded-md border border-blue-200 bg-blue-50 p-3">
          <div className="flex items-start space-x-2">
            <AlertTriangle className="w-5 h-5 text-blue-600 mt-0.5" />
            <div className="text-sm text-blue-700">
              <strong>Migration abgeschlossen:</strong> Alle Dateien wurden erfolgreich in den Netzwerkordner migriert. 
              Downloads verwenden jetzt automatisch die migrierten Dateien.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
