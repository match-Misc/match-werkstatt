import { useEffect, useState } from 'react';
import { X, Download, Plus, Eye, Box, FileText } from 'lucide-react';
import { Order } from '../types';
import ws from '../utils/websocket';
import { useApp } from '../context/AppContext';
import NetworkFileUpload from './NetworkFileUpload';
import STLViewer from './STLViewer';

interface OrderDetailsProps {
  order: Order;
  onClose: () => void;
}

export default function OrderDetails({ order, onClose }: OrderDetailsProps) {
  const { state, dispatch } = useApp();
  // Immer die aktuellste Order aus dem Context holen
  const currentOrder = state.orders.find(o => o.id === order.id) || order;

  // --- State für Endabnahme/Nacharbeit ---
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showRevisionModal, setShowRevisionModal] = useState(false);
  const [confirmationNote, setConfirmationNote] = useState('');
  const [revisionDescription, setRevisionDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [titleImageUrl, setTitleImageUrl] = useState('');
  const [showSTLViewers, setShowSTLViewers] = useState<{[key: string]: boolean}>({});

  const toggleSTLViewer = (docId: string) => {
    setShowSTLViewers(prev => ({
      ...prev,
      [docId]: !prev[docId]
    }));
  };

  const isSTLFile = (fileName: string) => {
    return /\.stl$/i.test(fileName);
  };

  const getFileIcon = (fileName: string) => {
    if (isSTLFile(fileName)) return <Box className="w-5 h-5 text-purple-600" />;
    return <FileText className="w-5 h-5 text-red-600" />;
  };

  const getFileTypeDescription = (fileName: string) => {
    if (isSTLFile(fileName)) return '3D-Modell (STL)';
    return 'PDF-Dokument';
  };
  const [showComponentUpload, setShowComponentUpload] = useState(false);
  const [activeComponentId, setActiveComponentId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'components'>('dashboard');

  useEffect(() => {
    if (currentOrder.titleImage) {
      // Hänge einen Zeitstempel an, um den Browser-Cache zu umgehen
      setTitleImageUrl(`/api/orders/${currentOrder.id}/title-image?t=${new Date().getTime()}`);
    } else {
      setTitleImageUrl('');
    }
  }, [currentOrder.titleImage, currentOrder.id]);

  useEffect(() => {
    // WebSocket verbinden und auf Events hören
    ws.connect(order.id, (_data) => {
      // Nach Event: Context wird aktualisiert, Komponente rendert neu
      // (optional: hier könnte man auch einen Backend-Reload triggern)
    });
    return () => {
      ws.disconnect();
    };
  }, [order.id]);

  // Debug: User und Order-Status prüfen
  useEffect(() => {
    console.log('OrderDetails: currentUser', state.currentUser);
    console.log('OrderDetails: currentOrder.status', currentOrder.status);
    console.log('OrderDetails: currentOrder', currentOrder);
    console.log('OrderDetails: currentOrder.components', currentOrder.components);
    console.log('OrderDetails: currentOrder.reworkComments', currentOrder.reworkComments);
  }, [state.currentUser, currentOrder.status, currentOrder]);

  // Zeige eine Warnung, wenn kein User im State ist
  useEffect(() => {
    if (!state.currentUser) {
      alert('FEHLER: Kein Benutzer im System angemeldet! Bitte neu einloggen.');
      console.error('OrderDetails: currentUser fehlt!', state.currentUser);
    } else {
      console.log('OrderDetails: currentUser vorhanden', state.currentUser);
    }
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'accepted': return 'bg-blue-100 text-blue-800';
      case 'in_progress': return 'bg-purple-100 text-purple-800';
      case 'revision': return 'bg-orange-100 text-orange-800';
      case 'rework': return 'bg-orange-100 text-orange-800';
      case 'completed': return 'bg-green-100 text-green-800';
      case 'waiting_confirmation': return 'bg-cyan-100 text-cyan-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending': return 'Ausstehend';
      case 'accepted': return 'Angenommen';
      case 'in_progress': return 'In Bearbeitung';
      case 'revision': return 'Überarbeitung';
      case 'rework': return 'In Nacharbeit';
      case 'completed': return 'Abgeschlossen';
      case 'waiting_confirmation': return 'Wartet auf Abnahme';
      default: return status;
    }
  };

  const handleDownload = async (doc: any) => {
    try {
      // Generate a very strong cache-busting identifier
      const cacheBuster = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${performance.now()}`;
      
      // Priority 1: Try direct file access by original filename (checks network folder first)
      if (currentOrder.id && doc.name) {
        const baseUrl = `/api/orders/${currentOrder.id}/files/${encodeURIComponent(doc.name)}`;
        const directUrl = `${baseUrl}?cb=${cacheBuster}&_nocache=1`;
        
        try {
          const headRes = await fetch(directUrl, { 
            method: 'HEAD',
            cache: 'no-store',
            headers: {
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'Pragma': 'no-cache',
              'Expires': '0'
            }
          });
          if (headRes.ok) {
            console.log(`[Download] Using direct file access for: ${doc.name}`);
            console.log(`[Download] File path: ${headRes.headers.get('X-File-Path')}`);
            console.log(`[Download] File mtime: ${headRes.headers.get('X-File-Mtime')}`);
            
            // Use a new window to force fresh download
            const newWindow = window.open(directUrl, '_blank');
            if (newWindow) {
              // Close the window after a short delay
              setTimeout(() => newWindow.close(), 1000);
            } else {
              // Fallback to location.href if popup blocked
              window.location.href = directUrl;
            }
            return;
          }
        } catch (directError) {
          console.log('Direct file access failed, trying document ID method');
        }
      }
      
      // Priority 2: Try document ID method (existing fallback)
      if (doc.id) {
        const baseIdUrl = `/api/documents/${doc.id}`;
        const idUrl = `${baseIdUrl}?cb=${cacheBuster}&_nocache=1`;
        
        try {
          const headRes = await fetch(idUrl, { 
            method: 'HEAD',
            cache: 'no-store',
            headers: {
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'Pragma': 'no-cache',
              'Expires': '0'
            }
          });
          if (headRes.ok) {
            console.log(`[Download] Using document ID access for: ${doc.name}`);
            console.log(`[Download] File path: ${headRes.headers.get('X-File-Path')}`);
            console.log(`[Download] File mtime: ${headRes.headers.get('X-File-Mtime')}`);
            
            // Use a new window to force fresh download
            const newWindow = window.open(idUrl, '_blank');
            if (newWindow) {
              setTimeout(() => newWindow.close(), 1000);
            } else {
              window.location.href = idUrl;
            }
            return;
          }
        } catch (idError) {
          console.log('Document ID access failed, trying URL method');
        }
      }
      
      // Priority 3: Fallback to direct URL (legacy method)
      if (doc.url) {
        const base = doc.url.startsWith('/uploads/') ? `${doc.url}` : doc.url;
        const withTs = base.includes('?') ? `${base}&cb=${cacheBuster}` : `${base}?cb=${cacheBuster}`;
        console.log(`[Download] Using legacy URL access for: ${doc.name}`);
        window.location.href = withTs;
        return;
      }
      
      // If all methods fail
      dispatch({
        type: 'SHOW_NOTIFICATION',
        payload: {
          message: `Datei \"${doc.name}\" konnte nicht gefunden werden`,
          type: 'error'
        }
      });
      
    } catch (error) {
      console.error('Download error:', error);
      dispatch({
        type: 'SHOW_NOTIFICATION',
        payload: {
          message: `Fehler beim Herunterladen von \"${doc.name}\"`,
          type: 'error'
        }
      });
    }
  };

  const handleViewPDF = (doc: any) => {
    // We omit cache busters here because adblockers/privacy extensions in Firefox
    // sometimes block URLs containing tracking-like query parameters like 'cb='.
    if (doc.id) {
      const url = `/api/documents/${doc.id}?inline=true`;
      window.open(url, '_blank');
    } else if (currentOrder.id && doc.name) {
      const url = `/api/orders/${currentOrder.id}/files/${encodeURIComponent(doc.name)}?inline=true`;
      window.open(url, '_blank');
    } else if (doc.url) {
      window.open(doc.url, '_blank');
    }
  };

  // Materialstatus aktualisieren (nur für Kunden-Checkbox)
  const handleMaterialStatusUpdate = async (field: 'materialOrderedByClientConfirmed', value: boolean) => {
    try {
      // Sofort lokalen State aktualisieren für bessere UX
      const updatedOrder = { ...currentOrder, [field]: value };
      dispatch({ type: 'UPDATE_ORDER', payload: updatedOrder });
      
      const response = await fetch(`/api/orders/${currentOrder.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });
      
      if (!response.ok) {
        // Bei Fehler den ursprünglichen Zustand wiederherstellen
        dispatch({ type: 'UPDATE_ORDER', payload: currentOrder });
        throw new Error('Fehler beim Aktualisieren');
      }
      
      // Erfolgreiche Antwort vom Server verwenden
      const serverResponse = await response.json();
      dispatch({ type: 'UPDATE_ORDER', payload: serverResponse });
      dispatch({ type: 'SHOW_NOTIFICATION', payload: { message: 'Materialstatus aktualisiert!', type: 'success' } });
    } catch (err) {
      dispatch({ type: 'SHOW_NOTIFICATION', payload: { message: 'Fehler beim Aktualisieren!', type: 'error' } });
    }
  };

  // Auftrag löschen (nur für Admin)
  const handleDelete = async () => {
    if (!state.currentUser || state.currentUser.role !== 'admin') {
      alert('Nur Admins dürfen Aufträge löschen!');
      return;
    }
    if (!window.confirm('Diesen Auftrag wirklich unwiderruflich löschen?')) return;
    try {
      const response = await fetch(`/api/orders/${currentOrder.id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        alert('Fehler beim Löschen!');
        return;
      }
      
      // Immediately remove the order from the global state
      dispatch({ type: 'DELETE_ORDER', payload: currentOrder.id });
      dispatch({ type: 'SHOW_NOTIFICATION', payload: { message: 'Auftrag erfolgreich gelöscht.', type: 'success' } });
      
      onClose();
    } catch (err) {
      alert('Netzwerkfehler beim Löschen!');
    }
  };

  // Endabnahme bestätigen
  const handleConfirmOrder = async () => {
    setIsSubmitting(true);
    try {
      const updatedOrder = {
        ...currentOrder,
        status: 'completed',
        confirmationNote,
        confirmationDate: new Date(),
        updatedAt: new Date(),
      };
      console.log('PUT /api/orders/:id (Bestätigen):', updatedOrder);
      const response = await fetch(`/api/orders/${currentOrder.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedOrder),
      });
      if (!response.ok) throw new Error('Fehler beim Bestätigen');
      
      // Den aktualisierten Auftrag aus der Response holen und den Context aktualisieren
      const updatedOrderFromResponse = await response.json();
      console.log('=== FRONTEND: Updated Order received (Confirmation) ===');
      
      // Context mit dem aktualisierten Auftrag updaten
      dispatch({ 
        type: 'UPDATE_ORDER', 
        payload: updatedOrderFromResponse 
      });
      
      setShowConfirmModal(false);
      setConfirmationNote('');
      dispatch({ type: 'SHOW_NOTIFICATION', payload: { message: 'Auftrag bestätigt!', type: 'success' } });
    } catch (err) {
      dispatch({ type: 'SHOW_NOTIFICATION', payload: { message: 'Fehler bei der Bestätigung!', type: 'error' } });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Nacharbeit anfordern
  const handleRequestRevision = async () => {
    console.log('=== FRONTEND: handleRequestRevision called ===');
    console.log('revisionDescription:', revisionDescription);
    console.log('currentUser:', state.currentUser);
    console.log('currentOrder:', currentOrder);
    
    if (!revisionDescription.trim()) {
      dispatch({ type: 'SHOW_NOTIFICATION', payload: { message: 'Bitte geben Sie eine Beschreibung für die Nacharbeit ein!', type: 'error' } });
      return;
    }

    if (!state.currentUser?.id || !state.currentUser?.name) {
      alert('FEHLER: Kein Benutzer im System angemeldet! Bitte neu einloggen.');
      dispatch({ type: 'SHOW_NOTIFICATION', payload: { message: 'Fehler: Benutzerinformationen nicht verfügbar!', type: 'error' } });
      console.error('currentUser missing:', state.currentUser);
      return;
    }
    
    setIsSubmitting(true);
    try {
      // Saubere Datenstruktur für Kundenkommentare - keine Arrays überschreiben!
      const requestBody = {
        status: 'rework',
        revisionComment: revisionDescription, // Der Kommentartext
        userId: state.currentUser.id,
        userName: state.currentUser.name,
        updatedAt: new Date(),
      };
      
      console.log('=== FRONTEND: Request Body vor dem Senden ===');
      console.log('Full requestBody:', JSON.stringify(requestBody, null, 2));
      console.log('===============================================');
      
      console.log('PUT /api/orders/:id (Nacharbeit):', requestBody);
      const response = await fetch(`/api/orders/${currentOrder.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      if (!response.ok) throw new Error('Fehler bei Nacharbeitsanfrage');
      
      // Den aktualisierten Auftrag aus der Response holen und den Context aktualisieren
      const updatedOrder = await response.json();
      console.log('=== FRONTEND: Updated Order received ===');
      console.log('reworkComments in response:', updatedOrder.reworkComments);
      console.log('About to dispatch UPDATE_ORDER with payload:', updatedOrder);
      
      // Context mit dem aktualisierten Auftrag updaten
      dispatch({ 
        type: 'UPDATE_ORDER', 
        payload: updatedOrder 
      });
      console.log('=== FRONTEND: UPDATE_ORDER dispatched ===');
      
      setShowRevisionModal(false);
      setRevisionDescription('');
      dispatch({ type: 'SHOW_NOTIFICATION', payload: { message: 'Nacharbeit angefordert!', type: 'success' } });
    } catch (err) {
      dispatch({ type: 'SHOW_NOTIFICATION', payload: { message: 'Fehler bei der Nacharbeitsanfrage!', type: 'error' } });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b bg-gray-50 rounded-t-lg">
          <div>
            <h2 className="text-2xl font-bold text-gray-800 truncate" title={currentOrder.title}>{currentOrder.title}</h2>
            <p className="text-gray-600 mt-1">Auftrags-Nr.: {currentOrder.orderNumber || currentOrder.id}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Tabs Navigation */}
        <div className="border-b border-gray-200 bg-gray-50 px-6">
          <nav className="-mb-px flex space-x-8" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`${
                activeTab === 'dashboard'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setActiveTab('components')}
              className={`${
                activeTab === 'components'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}
            >
              Bauteilübersicht
            </button>
          </nav>
        </div>

        <div className="p-8 overflow-y-auto flex-grow">
          {activeTab === 'dashboard' && (
            <div className="space-y-6">

              {/* Titelbild (falls vorhanden) */}
              {titleImageUrl && (
                <div className="bg-white p-6 rounded-lg shadow-sm border">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">Titelbild</h3>
                  <img 
                    src={titleImageUrl}
                    alt="Titelbild des Auftrags"
                    className="w-full h-auto max-h-96 object-contain rounded-lg shadow-md"
                  />
                </div>
              )}

              {/* Auftragsinformationen */}
              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Auftragsinformationen</h3>
                <div className="flex flex-col gap-4">
                  {/* Obere Zeile */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">Kostenstelle:</span>
                      <span className="text-sm font-medium text-gray-900">{currentOrder.costCenter}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">Erstellt am:</span>
                      <span className="text-sm font-medium text-gray-900">
                        {new Date(currentOrder.createdAt).toLocaleDateString('de-DE')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">Deadline:</span>
                      <span className="text-sm font-medium text-gray-900">
                        {new Date(currentOrder.deadline).toLocaleDateString('de-DE')}
                      </span>
                    </div>
                  </div>
                  {/* Untere Zeile */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">Status:</span>
                      <span className={`inline-flex px-3 py-1 text-xs rounded-full font-medium ${getStatusColor(currentOrder.status)}`}>
                        {getStatusText(currentOrder.status)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">Priorität:</span>
                      <span className={`inline-flex px-3 py-1 text-xs rounded-full border font-medium capitalize bg-gray-100 text-gray-800`}>
                        {currentOrder.priority}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <hr className="border-t border-gray-200" />

              {/* Arbeitsbereich */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Arbeitsbereich</h3>
                
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Zugewiesen an
                      </label>
                      <div className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-900">
                        {currentOrder.assignedTo 
                          ? (state.workshopAccounts.find(acc => acc.id === currentOrder.assignedTo)?.name || 'Werkstatt Personal')
                          : 'Nicht zugewiesen'}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Geschätzte Stunden
                      </label>
                      <div className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-900">
                        {currentOrder.estimatedHours}h
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Tatsächliche Stunden
                      </label>
                      <div className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-900">
                        {currentOrder.actualHours}h
                      </div>
                    </div>
                  </div>

                  {currentOrder.notes && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Notizen
                      </label>
                      <div className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-900 whitespace-pre-wrap">
                        {currentOrder.notes}
                      </div>
                    </div>
                  )}

                  {/* Materialstatus Sektion */}
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Materialstatus
                    </label>
                    <div className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-900">
                      {currentOrder.materialAvailable && "Material vorhanden"}
                      {currentOrder.materialOrderedByWorkshop && "Material durch Werkstatt bestellt"}
                      
                      {currentOrder.materialOrderedByClient && (
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center text-sm text-gray-800">
                            Material selbst bestellen
                          </div>
                          <label className="flex items-center p-2 bg-blue-50 border border-blue-100 rounded cursor-pointer">
                            <input
                              type="checkbox"
                              checked={currentOrder.materialOrderedByClientConfirmed || false}
                              onChange={(e) => handleMaterialStatusUpdate('materialOrderedByClientConfirmed', e.target.checked)}
                              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                            />
                            <span className="ml-2 text-sm text-gray-700 font-medium">Ich bestätige, dass ich das Material bestellt habe</span>
                          </label>
                        </div>
                      )}

                      {!currentOrder.materialAvailable && !currentOrder.materialOrderedByWorkshop && !currentOrder.materialOrderedByClient && "Kein Material benötigt"}
                    </div>
                  </div>
                </div>
              </div>

              <hr className="border-t border-gray-200" />

              <div>
                <h4 className="text-md font-semibold text-gray-900 mb-2">Beschreibung</h4>
                <p className="text-gray-700 bg-gray-50 rounded-lg p-4">{currentOrder.description}</p>
              </div>

              {/* Kombinierter und sortierter Kommentarverlauf */}
              {(() => {
                const combinedComments = [
                  ...(currentOrder.revisionHistory || []),
                  ...(currentOrder.reworkComments || [])
                ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

                if (combinedComments.length === 0) {
                  return null;
                }

                return (
                  <div>
                    <h4 className="text-md font-semibold text-gray-900 mb-2">Kommentarverlauf</h4>
                    <div className="space-y-4 bg-gray-50 rounded-lg p-4 border border-gray-200">
                      {combinedComments.map((entry: any, index: number) => (
                        <div 
                          key={index} 
                          className={`p-3 rounded-md shadow-sm ${entry.userName === 'Werkstatt' ? 'bg-orange-50 border-l-4 border-orange-300' : 'bg-blue-50 border-r-4 border-blue-300'}`}>
                          <p className="text-sm text-gray-800 whitespace-pre-wrap">{entry.comment}</p>
                          <p className={`text-xs text-gray-500 mt-2 ${entry.userName === 'Werkstatt' ? 'text-left' : 'text-right'}`}>
                            <strong>{entry.userName}</strong> am {new Date(entry.createdAt).toLocaleString('de-DE')}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Endabnahme-Kommentar und Nacharbeitsanfrage */}
              {(currentOrder.confirmationNote || currentOrder.confirmationDate) && (
                <div>
                  <h4 className="text-md font-semibold text-green-700 mb-2">Endabnahme durch Kunde</h4>
                  {currentOrder.confirmationNote && (
                    <div className="bg-green-50 rounded-lg p-3 mb-2">
                      <span className="block text-gray-700">Kommentar:</span>
                      <span className="block text-gray-900">{currentOrder.confirmationNote}</span>
                    </div>
                  )}
                  {currentOrder.confirmationDate && (
                    <div className="text-xs text-gray-500 mb-2">
                      Bestätigt am: {new Date(currentOrder.confirmationDate).toLocaleString('de-DE')}
                    </div>
                  )}
                </div>
              )}

              {currentOrder.revisionRequest && (
                <div>
                  <h4 className="text-md font-semibold text-orange-700 mb-2">Nacharbeitsanfrage</h4>
                  <div className="bg-orange-50 rounded-lg p-3 mb-2">
                    <span className="block text-gray-700">Beschreibung:</span>
                    <span className="block text-gray-900">{currentOrder.revisionRequest.description}</span>
                    {currentOrder.revisionRequest.newDeadline && (
                      <div className="text-xs text-gray-500 mt-2">
                        Neue Deadline: {new Date(currentOrder.revisionRequest.newDeadline).toLocaleDateString('de-DE')}
                      </div>
                    )}
                    <div className="text-xs text-gray-400 mt-2">
                      Angefordert am: {new Date(currentOrder.revisionRequest.requestedAt).toLocaleString('de-DE')}
                    </div>
                  </div>
                  {currentOrder.revisionRequest.documents && currentOrder.revisionRequest.documents.length > 0 && (
                    <div className="mb-2">
                      <span className="block text-gray-700 font-medium mb-1">Neue Dokumente:</span>
                      <div className="space-y-1">
                        {currentOrder.revisionRequest.documents.map((doc) => (
                          <div key={doc.id} className="flex items-center justify-between p-2 bg-gray-100 rounded">
                            <span className="text-sm text-gray-900">{doc.name}</span>
                            <div className="flex items-center space-x-2">
                              {doc.name?.toLowerCase().endsWith('.pdf') && (
                                <button
                                  onClick={() => handleViewPDF(doc)}
                                  className="text-red-600 hover:text-red-800 transition-colors flex items-center text-xs"
                                >
                                  <Eye className="w-4 h-4 mr-1" />Anzeigen
                                </button>
                              )}
                              <button onClick={() => handleDownload(doc)} className="text-blue-600 hover:text-blue-800 flex items-center text-xs">
                                <Download className="w-4 h-4 mr-1" />Download
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'components' && (
            <div className="space-y-6">
              {/* Bauteile-Bereich */}
              {currentOrder.components && currentOrder.components.length > 0 && (
                <div>
                  <h4 className="text-md font-semibold text-gray-900 mb-2">Bauteile</h4>
                  <div className="space-y-4">
                    {currentOrder.components.map((component) => (
                      <div key={component.id} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                        <div className="mb-3">
                          <h5 className="font-medium text-gray-900 text-sm">{component.title}</h5>
                          <div className="text-gray-600 text-sm mt-1 flex flex-wrap gap-x-4 gap-y-1">
                            <span>Anzahl: {component.quantity || 1}</span>
                            {component.material && <span>Material: {component.material}</span>}
                          </div>
                          {component.description && (
                            <p className="text-gray-600 text-sm mt-2">{component.description}</p>
                          )}
                        </div>
                        
                        {/* Component Documents */}
                        <div>
                          <div className="flex justify-between items-center mb-2">
                            <h6 className="text-xs font-medium text-gray-700">Dokumente:</h6>
                            {state.currentUser && state.currentUser.role !== 'client' && (
                              <button 
                                onClick={() => {
                                  // Store the component ID for the upload form
                                  setActiveComponentId(component.id);
                                  setShowComponentUpload(prev => !prev);
                                }}
                                className="flex items-center text-xs text-blue-600 hover:text-blue-800"
                              >
                                {showComponentUpload && activeComponentId === component.id ? (
                                  <><X className="w-3 h-3 mr-1" /> Abbrechen</>
                                ) : (
                                  <><Plus className="w-3 h-3 mr-1" /> Datei hochladen</>
                                )}
                              </button>
                            )}
                          </div>
                          
                          {showComponentUpload && activeComponentId === component.id && 
                           state.currentUser && state.currentUser.role !== 'client' && (
                            <div className="mb-3">
                              <NetworkFileUpload
                                orderId={currentOrder.id}
                                componentId={component.id}
                                uploadType="component"
                                onUploadSuccess={() => {
                                  setShowComponentUpload(false);
                                  dispatch({
                                    type: 'SHOW_NOTIFICATION',
                                    payload: {
                                      message: 'Bauteil-Dokument erfolgreich hochgeladen',
                                      type: 'success'
                                    }
                                  });
                                  
                                  // Reload order to get updated documents
                                  fetch(`/api/orders/${currentOrder.id}`)
                                    .then(response => response.json())
                                    .then(data => {
                                      dispatch({
                                        type: 'UPDATE_ORDER',
                                        payload: data
                                      });
                                    })
                                    .catch(error => {
                                      console.error('Error reloading order:', error);
                                    });
                                }}
                                onUploadError={(error) => {
                                  dispatch({
                                    type: 'SHOW_NOTIFICATION',
                                    payload: {
                                      message: `Fehler beim Hochladen: ${error.message}`,
                                      type: 'error'
                                    }
                                  });
                                }}
                              />
                            </div>
                          )}
                          
                          {component.documents && component.documents.length > 0 ? (
                            <div className="space-y-2">
                              {component.documents.map((doc) => (
                                <div key={doc.id} className="flex items-center justify-between p-2 bg-white rounded border text-sm">
                                  <div className="flex items-center">
                                    {getFileIcon(doc.name)}
                                    <div className="ml-2">
                                      <span className="text-gray-900">{doc.name}</span>
                                      <div className="text-xs text-gray-500">
                                        {getFileTypeDescription(doc.name)} • {new Date(doc.uploadDate).toLocaleDateString('de-DE')}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    {isSTLFile(doc.name) && (
                                      <button
                                        onClick={() => toggleSTLViewer(doc.id)}
                                        className="text-purple-600 hover:text-purple-800 transition-colors flex items-center text-xs"
                                      >
                                        <Eye className="w-3 h-3 mr-1" />
                                        3D
                                      </button>
                                    )}
                                    {doc.name?.toLowerCase().endsWith('.pdf') && (
                                      <button
                                        onClick={() => handleViewPDF(doc)}
                                        className="text-red-600 hover:text-red-800 transition-colors flex items-center text-xs"
                                      >
                                        <Eye className="w-3 h-3 mr-1" />
                                        Anzeigen
                                      </button>
                                    )}
                                    <button
                                      onClick={() => handleDownload(doc)}
                                      className="text-blue-600 hover:text-blue-800 transition-colors flex items-center text-xs"
                                    >
                                      <Download className="w-3 h-3 mr-1" />
                                      Download
                                    </button>
                                  </div>
                                </div>
                              ))}
                              
                              {/* STL Viewers für Component Documents */}
                              {component.documents.map((doc) => (
                                isSTLFile(doc.name) && showSTLViewers[doc.id] && (
                                  <div key={`viewer-${doc.id}`} className="mt-2 p-4 bg-gray-50 rounded-lg">
                                    <STLViewer
                                      fileUrl={`${doc.url}`}
                                      fileName={doc.name}
                                      className="w-full"
                                      showControls={true}
                                    />
                                  </div>
                                )
                              ))}
                            </div>
                          ) : (
                            <p className="text-gray-500 text-xs">Keine Dokumente hochgeladen</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Aktionen für Endabnahme */}
        {currentOrder.status === 'waiting_confirmation' && state.currentUser?.role === 'client' && (
          <div className="p-6 bg-gray-50 border-t">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Endabnahme</h3>
            <p className="text-sm text-gray-600 mb-4">
              Bitte überprüfen Sie den Auftrag. Sie können die Fertigstellung bestätigen oder eine Nacharbeit mit Anmerkungen anfordern.
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => setShowConfirmModal(true)}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
              >
                Auftrag bestätigen
              </button>
              <button
                onClick={() => setShowRevisionModal(true)}
                className="bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 transition-colors"
              >
                Nacharbeit anfordern
              </button>
            </div>
          </div>
        )}

        {/* Admin-Aktionen */}
        {state.currentUser?.role === 'admin' && (
          <div className="p-6 bg-gray-50 border-t">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Admin-Aktionen</h3>
            <button
              onClick={handleDelete}
              className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
            >
              Auftrag löschen
            </button>
          </div>
        )}
      </div>

      {/* Modal für Bestätigung */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-8 rounded-lg shadow-xl max-w-md w-full">
            <h3 className="text-xl font-bold mb-4">Endabnahme bestätigen</h3>
            <p className="mb-4 text-gray-700">Möchten Sie die Fertigstellung dieses Auftrags wirklich bestätigen?</p>
            <textarea
              value={confirmationNote}
              onChange={(e) => setConfirmationNote(e.target.value)}
              placeholder="Optionale Anmerkung zur Abnahme..."
              className="w-full p-2 border rounded-lg mb-4"
              rows={3}
            />
            <div className="flex justify-end gap-4">
              <button onClick={() => setShowConfirmModal(false)} className="text-gray-600">Abbrechen</button>
              <button
                onClick={handleConfirmOrder}
                disabled={isSubmitting}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400"
              >
                {isSubmitting ? 'Wird bestätigt...' : 'Bestätigen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal für Nacharbeit */}
      {showRevisionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-8 rounded-lg shadow-xl max-w-lg w-full">
            <h3 className="text-xl font-bold mb-4">Nacharbeit anfordern</h3>
            <p className="mb-4 text-gray-700">Bitte beschreiben Sie die gewünschten Änderungen. Diese werden an die Werkstatt übermittelt.</p>
            <textarea
              value={revisionDescription}
              onChange={(e) => setRevisionDescription(e.target.value)}
              placeholder="Beschreiben Sie hier detailliert die notwendige Nacharbeit..."
              className="w-full p-2 border rounded-lg mb-4"
              rows={5}
              required
            />
            <div className="flex justify-end gap-4">
              <button onClick={() => setShowRevisionModal(false)} className="text-gray-600">Abbrechen</button>
              <button
                onClick={handleRequestRevision}
                disabled={isSubmitting || !revisionDescription.trim()}
                className="bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 disabled:bg-gray-400"
              >
                {isSubmitting ? 'Wird gesendet...' : 'Nacharbeit anfordern'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}