import { useEffect, useState } from 'react';
import { X, FileText, Download, Upload, Plus } from 'lucide-react';
import { Order } from '../types';
import ws from '../utils/websocket';
import { useApp } from '../context/AppContext';
import NetworkFileUpload from './NetworkFileUpload';

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
  const [showUploadSection, setShowUploadSection] = useState(false);
  const [showComponentUpload, setShowComponentUpload] = useState(false);
  const [activeComponentId, setActiveComponentId] = useState<string | null>(null);

  useEffect(() => {
    if (currentOrder.titleImage) {
      // Hänge einen Zeitstempel an, um den Browser-Cache zu umgehen
      setTitleImageUrl(`http://localhost:3001/api/orders/${currentOrder.id}/title-image?t=${new Date().getTime()}`);
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

  const handleDownload = (doc: any) => {
    if (doc.url) {
      const a = document.createElement('a');
      a.href = doc.url.startsWith('/uploads/') ? `http://localhost:3001${doc.url}` : doc.url;
      a.download = doc.name;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-auto">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
          <div className="flex flex-col">
            <h2 className="text-xl font-bold text-gray-900">
              {currentOrder.orderNumber && (
                <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-md text-sm mr-2">
                  {currentOrder.orderNumber}
                </span>
              )}
              {currentOrder.title}
            </h2>
            <div className="text-sm text-gray-500 mt-1">
              <span className={`px-2 py-0.5 rounded-full ${getStatusColor(currentOrder.status)}`}>
                {getStatusText(currentOrder.status)}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500 focus:outline-none"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="flex flex-wrap gap-6">
            {titleImageUrl && (
              <div className="w-36 h-36 flex-shrink-0">
                <img 
                  src={titleImageUrl} 
                  alt="Auftragsvorschau" 
                  className="w-full h-full object-cover rounded-lg shadow-sm"
                />
              </div>
            )}
            <div className="flex-1 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-sm text-gray-600">Kunde</span>
                  <p className="text-sm font-medium text-gray-900">{currentOrder.clientName}</p>
                </div>
                <div>
                  <span className="text-sm text-gray-600">Fälligkeitsdatum</span>
                  <p className="text-sm font-medium text-gray-900">
                    {new Date(currentOrder.deadline).toLocaleDateString('de-DE')}
                  </p>
                </div>
                <div>
                  <span className="text-sm text-gray-600">Kostenstelle</span>
                  <p className="text-sm font-medium text-gray-900">{currentOrder.costCenter}</p>
                </div>
                <div>
                  <span className="text-sm text-gray-600">Priorität</span>
                  <p className="text-sm font-medium text-gray-900 capitalize">{currentOrder.priority}</p>
                </div>
              </div>
            </div>
          </div>

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

          <div>
            <div className="flex justify-between items-center mb-2">
              <h4 className="text-md font-semibold text-gray-900">Dokumente</h4>
              {state.currentUser && state.currentUser.role !== 'client' && (
                <button 
                  onClick={() => setShowUploadSection(prev => !prev)}
                  className="flex items-center text-sm text-blue-600 hover:text-blue-800"
                >
                  {showUploadSection ? (
                    <><X className="w-4 h-4 mr-1" /> Abbrechen</>
                  ) : (
                    <><Plus className="w-4 h-4 mr-1" /> Datei hochladen</>
                  )}
                </button>
              )}
            </div>
            
            {showUploadSection && state.currentUser && state.currentUser.role !== 'client' && (
              <div className="mb-4">
                <NetworkFileUpload
                  orderId={currentOrder.id}
                  uploadType="document"
                  onUploadSuccess={() => {
                    setShowUploadSection(false);
                    dispatch({
                      type: 'SHOW_NOTIFICATION',
                      payload: {
                        message: 'Dokument erfolgreich hochgeladen',
                        type: 'success'
                      }
                    });
                    
                    // Reload order to get updated documents
                    fetch(`http://localhost:3001/api/orders/${currentOrder.id}`)
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
            
            {currentOrder.documents && currentOrder.documents.length > 0 ? (
              <div className="space-y-2">
                {currentOrder.documents.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center">
                      <FileText className="w-5 h-5 text-red-600 mr-3" />
                      <div>
                        <span className="text-sm text-gray-900">{doc.name}</span>
                        <div className="text-xs text-gray-500">
                          {new Date(doc.uploadDate).toLocaleDateString('de-DE')}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDownload(doc)}
                      className="text-blue-600 hover:text-blue-800 transition-colors flex items-center"
                    >
                      <Download className="w-4 h-4 mr-1" />
                      <span className="text-sm">Download</span>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">Keine Dokumente hochgeladen</p>
            )}
          </div>

          {/* Bauteile-Bereich */}
          {currentOrder.components && currentOrder.components.length > 0 && (
            <div>
              <h4 className="text-md font-semibold text-gray-900 mb-2">Bauteile</h4>
              <div className="space-y-4">
                {currentOrder.components.map((component) => (
                  <div key={component.id} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                    <div className="mb-3">
                      <h5 className="font-medium text-gray-900 text-sm">{component.title}</h5>
                      {component.description && (
                        <p className="text-gray-600 text-sm mt-1">{component.description}</p>
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
                              fetch(`http://localhost:3001/api/orders/${currentOrder.id}`)
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
                        <div className="space-y-1">
                          {component.documents.map((doc) => (
                            <div key={doc.id} className="flex items-center justify-between p-2 bg-white rounded border text-sm">
                              <div className="flex items-center">
                                <FileText className="w-4 h-4 text-red-600 mr-2" />
                                <div>
                                  <span className="text-gray-900">{doc.name}</span>
                                  <div className="text-xs text-gray-500">
                                    {new Date(doc.uploadDate).toLocaleDateString('de-DE')}
                                  </div>
                                </div>
                              </div>
                              <button
                                onClick={() => handleDownload(doc)}
                                className="text-blue-600 hover:text-blue-800 transition-colors flex items-center text-xs"
                              >
                                <Download className="w-3 h-3 mr-1" />
                                <span>Download</span>
                              </button>
                            </div>
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

          {/* CAM-Dateien Upload Button */}
          {state.currentUser && state.currentUser.role !== 'client' && (
            <div className="mt-4 border-t pt-4">
              <h4 className="text-md font-semibold text-gray-900 mb-2">CAM-Dateien</h4>
              <NetworkFileUpload
                orderId={currentOrder.id}
                uploadType="cam"
                className="mt-2"
                onUploadSuccess={() => {
                  dispatch({
                    type: 'SHOW_NOTIFICATION',
                    payload: {
                      message: 'CAM-Datei erfolgreich hochgeladen',
                      type: 'success'
                    }
                  });
                  
                  // Reload order
                  fetch(`http://localhost:3001/api/orders/${currentOrder.id}`)
                    .then(response => response.json())
                    .then(data => {
                      dispatch({
                        type: 'UPDATE_ORDER',
                        payload: data
                      });
                    });
                }}
                onUploadError={(error) => {
                  dispatch({
                    type: 'SHOW_NOTIFICATION',
                    payload: {
                      message: `Fehler beim Hochladen der CAM-Datei: ${error.message}`,
                      type: 'error'
                    }
                  });
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
