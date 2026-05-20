import React, { useState, useEffect } from 'react';
import { 
  X, 
  Check, 
  XCircle, 
  RotateCcw, 
  Clock, 
  FileText, 
  Plus, 
  Trash2,
  Archive,
  Download,
  Printer,
  Server,
  Eye
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Order, SubTask, PDFDocument, RevisionComment, NoteHistory } from '../types';
import OrderPDFGenerator from '../utils/OrderPDFGenerator';
import NetworkFolderStatus from './NetworkFolderStatus';
import NetworkFilesViewer from './NetworkFilesViewer';
import NetworkDragDropUpload from './NetworkDragDropUpload';
import STLViewer from './STLViewer';

interface WorkshopOrderDetailsProps {
  order: Order;
  onClose: () => void;
}

export default function WorkshopOrderDetails({ order, onClose }: WorkshopOrderDetailsProps) {
  const { state, dispatch } = useApp();
  const [localOrder, setLocalOrder] = useState(order);

  const [estimatedHours, setEstimatedHours] = useState(localOrder.estimatedHours?.toString() || '0');
  const [actualHours, setActualHours] = useState(localOrder.actualHours?.toString() || '0');
  const [notes, setNotes] = useState(localOrder.notes || '');
  const [internalWorkshopNote, setInternalWorkshopNote] = useState(localOrder.internalWorkshopNote || '');
  const [showAddSubTask, setShowAddSubTask] = useState(false);
  const [subTaskTitle, setSubTaskTitle] = useState('');
  const [subTaskDescription, setSubTaskDescription] = useState('');
  const [subTaskHours, setSubTaskHours] = useState('');
  const [subTaskDocuments, setSubTaskDocuments] = useState<PDFDocument[]>([]);
  const [assignedTo, setAssignedTo] = useState(localOrder.assignedTo || '');
  const [subTaskAssignedTo, setSubTaskAssignedTo] = useState('');
  const [subTaskScopeType, setSubTaskScopeType] = useState<'order' | 'component'>('order');
  const [subTaskAssignedComponentId, setSubTaskAssignedComponentId] = useState('');
  const [showSTLViewers, setShowSTLViewers] = useState<{[key: string]: boolean}>({});
  const [showComponentUpload, setShowComponentUpload] = useState(false);
  const [activeComponentId, setActiveComponentId] = useState<string | null>(null);

  const toggleSTLViewer = (docId: string) => {
    setShowSTLViewers(prev => ({
      ...prev,
      [docId]: !prev[docId]
    }));
  };

  const isSTLFile = (fileName: string) => {
    return /\.stl$/i.test(fileName);
  };

  const getFileIcon = (fileName: string, className = "w-5 h-5") => {
    if (isSTLFile(fileName)) return <Server className={`${className} text-purple-600`} />;
    return <FileText className={`${className} text-red-600`} />;
  };

  const getFileTypeDescription = (fileName: string) => {
    if (isSTLFile(fileName)) return '3D-Modell (STL)';
    return 'PDF-Dokument';
  };
  const [showRevisionDialog, setShowRevisionDialog] = useState(false);
  const [revisionComment, setRevisionComment] = useState('');
  const [revisionError, setRevisionError] = useState('');
  const [titleImageUrl, setTitleImageUrl] = useState('');
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [showNetworkFolder, setShowNetworkFolder] = useState(false);

  // Zustand für bearbeitete Felder
  const [changedFields, setChangedFields] = useState<Partial<Order>>({});

  const getComponentDisplayById = (componentId?: string | null) => {
    if (!componentId) {
      return null;
    }

    const component = localOrder.components?.find((comp) => {
      const compId = comp.id || (comp as any)._id;
      return compId === componentId;
    });

    if (!component) {
      return null;
    }

    return component.title || (component as any).name || 'Bauteil';
  };

  const calculateHoursFromSubTasks = (subTasks: SubTask[]) => {
    const estimatedHours = subTasks.reduce((sum, task) => sum + (Number(task.estimatedHours) || 0), 0);
    const actualHours = subTasks.reduce((sum, task) => sum + (Number(task.actualHours) || 0), 0);
    return { estimatedHours, actualHours };
  };

  // localOrder aktualisieren, wenn sich der Order im Context ändert
  useEffect(() => {
    const updatedOrder = state.orders.find(o => o.id === order.id);
    if (updatedOrder) {
      setLocalOrder(updatedOrder);
    }
  }, [state.orders, order.id]);

  useEffect(() => {
    if (localOrder.titleImage && localOrder.titleImage.hasImage) {
      // Append a timestamp to break browser cache when the image is updated
      const url = `/api/orders/${localOrder.id}/title-image?t=${new Date().getTime()}`;
      setTitleImageUrl(url);
    } else {
      setTitleImageUrl('');
    }
  }, [localOrder.titleImage, localOrder.id]);

  // Wrapper, um Änderungen zu sammeln
  const handleFieldChange = (field: keyof Order, value: any) => {
    // Lokalen State für die UI direkt aktualisieren
    const updateLocalState = () => {
        switch (field) {
            case 'assignedTo':
                setAssignedTo(value);
                break;
            case 'estimatedHours':
                setEstimatedHours(value.toString());
                break;
            case 'actualHours':
                setActualHours(value.toString());
                break;
            case 'notes':
                setNotes(value);
                break;
            case 'internalWorkshopNote':
              setInternalWorkshopNote(value);
              break;
            case 'materialOrderedByWorkshop':
            case 'materialOrderedByClient':
            case 'materialOrderedByClientConfirmed':
            case 'materialAvailable':
                // Aktualisiere direkt den lokalen Order-State für Checkboxen
                setLocalOrder(prev => ({ ...prev, [field]: value }));
                break;
        }
    };
    updateLocalState();

    // Änderungen für den nächsten Speicher-Vorgang sammeln
    setChangedFields(prev => ({ ...prev, [field]: value }));
  };

  // Hilfsfunktion für API-Update
  const updateOrder = async (updatedFields: Partial<Order>, notificationMsg?: string) => {
    // Verhindern, dass leere Updates gesendet werden
    if (Object.keys(updatedFields).length === 0) {
        if (notificationMsg) {
            dispatch({ type: 'SHOW_NOTIFICATION', payload: { message: notificationMsg, type: 'success' } });
        }
        return;
    }

    try {
      const response = await fetch(`/api/orders/${localOrder.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedFields)
      });
      if (!response.ok) {
        const errorData = await response.json();
        dispatch({ type: 'SHOW_NOTIFICATION', payload: { message: `Fehler: ${errorData.error || 'Unbekannt'}`, type: 'error' } });
        return;
      }
      const freshOrder = await response.json();
      setLocalOrder(freshOrder);
      
      // Update global state as well
      dispatch({ type: 'UPDATE_ORDER', payload: freshOrder });
      
      setChangedFields({}); // Zurücksetzen nach erfolgreichem Speichern

      if (notificationMsg) {
        dispatch({ type: 'SHOW_NOTIFICATION', payload: { message: notificationMsg, type: 'success' } });
      }
    } catch (err) {
      dispatch({ type: 'SHOW_NOTIFICATION', payload: { message: 'Netzwerkfehler beim Speichern!', type: 'error' } });
    }
  };

  const handleSave = () => {
    // Sicherstellen, dass die Stunden als Zahlen gesendet werden
    const payload: Partial<Order> = {
        ...changedFields,
    };
    if (changedFields.estimatedHours !== undefined) {
        payload.estimatedHours = parseFloat(estimatedHours) || 0;
    }
    if (changedFields.actualHours !== undefined) {
        payload.actualHours = parseFloat(actualHours) || 0;
    }
    updateOrder(payload, 'Änderungen gespeichert');
  };

  const handleStatusChange = (newStatus: Order['status']) => {
    if (newStatus === 'revision') {
      setShowRevisionDialog(true);
      return;
    }
    const updatedFields: Partial<Order> = {
      ...changedFields,
      status: newStatus,
    };

    let message = '';
    switch (newStatus) {
      case 'accepted': message = 'Auftrag wurde erfolgreich angenommen'; break;
      case 'in_progress': message = 'Auftrag wurde gestartet'; break;
      case 'completed':
        // Check if order was created by workshop/admin or if current user is admin
        const isInternalOrder = !localOrder.clientId || 
                               localOrder.clientId === state.currentUser?.id ||
                               state.currentUser?.role === 'admin' ||
                               state.currentUser?.role === 'workshop';
        
        if (isInternalOrder) {
          // Direct completion for internal orders
          updatedFields.status = 'completed';
          updatedFields.confirmationDate = new Date();
          message = 'Auftrag wurde abgeschlossen';
        } else {
          // Client confirmation required for external orders
          updatedFields.status = 'waiting_confirmation';
          message = 'Auftrag wartet auf Endabnahme durch den Kunden';
        }
        break;
      default: message = 'Auftragsstatus wurde aktualisiert';
    }
    updateOrder(updatedFields, message);
  };

  // Revision absenden
  const submitRevision = async () => {
    if (!revisionComment.trim()) {
      setRevisionError('Kommentar ist erforderlich!');
      return;
    }
    setRevisionError('');
    setShowRevisionDialog(false);
    
    const requestBody: Partial<Order> & { revisionComment: string; userId?: string; userName?: string } = {
      ...changedFields,
      status: 'revision',
      canEdit: true,
      revisionComment,
      userId: state.currentUser?.id,
      userName: state.currentUser?.name,
    };
    
    updateOrder(requestBody, 'Auftrag wurde zur Überarbeitung zurückgeschickt');
    setRevisionComment('');
  };

  const handleTitleImageUpload = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`/api/orders/${localOrder.id}/upload-title-image`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        dispatch({ type: 'SHOW_NOTIFICATION', payload: { message: `Fehler: ${errorData.error || 'Unbekannt'}`, type: 'error' } });
        return;
      }

      // Da das Bild jetzt über einen separaten Endpunkt geladen wird,
      // müssen wir die URL im lokalen State "künstlich" erzeugen, um eine Neuanzeige zu triggern.
      // Ein Zeitstempel sorgt für einen einzigartigen Wert.
      const updatedOrderFromServer = await response.json();
      setLocalOrder(updatedOrderFromServer);

      dispatch({ type: 'SHOW_NOTIFICATION', payload: { message: 'Titelbild erfolgreich aktualisiert.', type: 'success' } });

    } catch (err) {
      dispatch({ type: 'SHOW_NOTIFICATION', payload: { message: 'Netzwerkfehler beim Upload des Titelbildes.', type: 'error' } });
    }
  };

  const handleTitleImageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleTitleImageUpload(e.target.files[0]);
    }
  };

  const removeTitleImage = async () => {
    // Create a payload with just the change
    const payload = { titleImage: null };
    updateOrder(payload, 'Titelbild entfernt.');
  };

  const handleArchive = async () => {
    // Prüfe ob Endabnahme durch WiMi erfolgt ist (confirmationDate muss gesetzt sein)
    if (!localOrder.confirmationDate) {
      dispatch({ 
        type: 'SHOW_NOTIFICATION', 
        payload: { 
          message: 'Archivierung nicht möglich: Der Auftrag muss zuerst vom Kunden bestätigt werden (Endabnahme).', 
          type: 'error' 
        } 
      });
      return;
    }
    updateOrder({ status: 'archived' }, 'Auftrag wurde archiviert');
    onClose();
  };

  // Prüfe ob alle Unteraufgaben erledigt sind
  const allSubTasksCompleted = () => {
    if (!localOrder.subTasks || localOrder.subTasks.length === 0) {
      return true; // Keine Unteraufgaben = OK
    }
    return localOrder.subTasks.every((task: any) => task.status === 'completed');
  };

  // Remove a temporary subtask document from local state
  const removeSubTaskDocument = (id: string) => {
    setSubTaskDocuments(prev => {
      const docToRemove = prev.find(doc => doc.id === id);
      if (docToRemove?.url) {
        try { URL.revokeObjectURL(docToRemove.url); } catch {}
      }
      return prev.filter(doc => doc.id !== id);
    });
  };

  const handleAddSubTask = async () => {
    if (!subTaskTitle.trim()) return;
    if (!subTaskAssignedTo.trim()) {
      dispatch({ type: 'SHOW_NOTIFICATION', payload: { message: 'Bitte einen Mitarbeiter zuweisen!', type: 'error' } });
      return;
    }
    
    const newSubTask: SubTask = {
      id: `subtask_${Date.now()}_${Math.random()}`,
      orderId: localOrder.id,
      title: subTaskTitle,
      description: subTaskDescription,
      estimatedHours: parseFloat(subTaskHours) || 0,
      actualHours: 0,
      status: 'pending',
      assignedTo: subTaskAssignedTo, // Mitarbeiter-ID (Pflicht)
      scopeType: subTaskScopeType, // Scope: 'order' oder 'component'
      assignedComponentId: subTaskScopeType === 'component' ? subTaskAssignedComponentId : null,
      assignedComponentTitle: subTaskScopeType === 'component' ? (getComponentDisplayById(subTaskAssignedComponentId) || 'Bauteil') : null,
      notes: '',
      documents: subTaskDocuments,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    const nextSubTasks = [...localOrder.subTasks, newSubTask];
    const autoHours = calculateHoursFromSubTasks(nextSubTasks);
    const updatedOrder = {
      ...localOrder,
      subTasks: nextSubTasks,
      estimatedHours: autoHours.estimatedHours,
      actualHours: autoHours.actualHours,
      updatedAt: new Date()
    };
    await updateOrder(updatedOrder, 'Unteraufgabe wurde erfolgreich hinzugefügt');
    setSubTaskTitle('');
    setSubTaskDescription('');
    setSubTaskHours('');
    setSubTaskAssignedTo('');
    setSubTaskScopeType('order');
    setSubTaskAssignedComponentId('');
    setSubTaskDocuments([]);
    setShowAddSubTask(false);
  };

  const handleUpdateSubTask = async (subTask: SubTask, updates: Partial<SubTask>) => {
    const updatedSubTask = {
      ...subTask,
      ...updates,
      updatedAt: new Date()
    };
    const nextSubTasks = localOrder.subTasks.map(st => st.id === subTask.id ? updatedSubTask : st);
    const autoHours = calculateHoursFromSubTasks(nextSubTasks);
    const updatedOrder = {
      ...localOrder,
      subTasks: nextSubTasks,
      estimatedHours: autoHours.estimatedHours,
      actualHours: autoHours.actualHours,
      updatedAt: new Date()
    };
    await updateOrder(updatedOrder, 'Unteraufgabe aktualisiert');
  };

  const handleDeleteSubTask = async (subTaskId: string) => {
    if (confirm('Sind Sie sicher, dass Sie diese Unteraufgabe löschen möchten?')) {
      const nextSubTasks = localOrder.subTasks.filter(st => st.id !== subTaskId);
      const autoHours = calculateHoursFromSubTasks(nextSubTasks);
      const updatedOrder = {
        ...localOrder,
        subTasks: nextSubTasks,
        estimatedHours: autoHours.estimatedHours,
        actualHours: autoHours.actualHours,
        updatedAt: new Date()
      };
      await updateOrder(updatedOrder, 'Unteraufgabe gelöscht');
    }
  };

  const handleDownload = async (doc: any) => {
    try {
      // Generate a very strong cache-busting identifier
      const cacheBuster = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${performance.now()}`;
      
      // Priority 1: Try direct file access by original filename (checks network folder first)
      if (localOrder.id && doc.name) {
        const baseUrl = `/api/orders/${localOrder.id}/files/${encodeURIComponent(doc.name)}`;
        const directUrl = `${baseUrl}?cb=${cacheBuster}&_nocache=1`;
        
        try {
          const response = await fetch(directUrl, { 
            method: 'HEAD',
            cache: 'no-store',
            headers: {
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'Pragma': 'no-cache',
              'Expires': '0'
            }
          });
          if (response.ok) {
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
          // Direct file access failed, trying document ID method
        }
      }

      // Priority 2: Try document ID method if present
      if (doc.id) {
        const baseIdUrl = `/api/documents/${doc.id}`;
        const idUrl = `${baseIdUrl}?cb=${cacheBuster}&_nocache=1`;
        
        try {
          const response = await fetch(idUrl, { 
            method: 'HEAD',
            cache: 'no-store',
            headers: {
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'Pragma': 'no-cache',
              'Expires': '0'
            }
          });
          if (response.ok) {
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
          // Document ID access failed, trying URL method
        }
      }

      // Priority 3: Fallback to direct URL (legacy)
      if (doc.url) {
        const base = doc.url.startsWith('/uploads/') ? `${doc.url}` : doc.url;
        const withTs = base.includes('?') ? `${base}&cb=${cacheBuster}` : `${base}?cb=${cacheBuster}`;
        window.location.href = withTs;
        return;
      }
    } catch (error) {
      console.error('Download error:', error);
    }
  };

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

  const canModify = state.currentUser?.role === 'admin' || 
                   (state.currentUser?.role === 'workshop' && localOrder.assignedTo === state.currentUser?.id);
  const canEditNotes = state.currentUser?.role === 'admin' || state.currentUser?.role === 'workshop';

  // Auftrag löschen (nur für Admin)
  const handleDeleteOrder = async () => {
    if (!state.currentUser || state.currentUser.role !== 'admin') {
      alert('Nur Admins dürfen Aufträge löschen!');
      return;
    }
    if (!window.confirm('Diesen Auftrag wirklich unwiderruflich löschen?')) return;
    try {
      const response = await fetch(`/api/orders/${localOrder.id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        alert('Fehler beim Löschen!');
        return;
      }
      
      // Immediately remove the order from the global state
      dispatch({ type: 'DELETE_ORDER', payload: localOrder.id });
      dispatch({ type: 'SHOW_NOTIFICATION', payload: { message: 'Auftrag erfolgreich gelöscht.', type: 'success' } });
      
      onClose();
    } catch (err) {
      alert('Netzwerkfehler beim Löschen!');
    }
  };

  // Hilfsfunktion für die Anzeige der Zuweisungsinformationen
  const getAssignmentDisplay = (subTask: SubTask) => {
    // Mitarbeiter-Zuweisung anzeigen
    let assignedUser = 'Nicht zugewiesen';
    if (subTask.assignedTo) {
      const employee = state.workshopAccounts.find(acc => acc.id === subTask.assignedTo);
      assignedUser = employee ? `👤 ${employee.name}` : 'Unbekannter Mitarbeiter';
    }
    
    // Scope anzeigen
    let scope = '';
    if (subTask.scopeType === 'component' && subTask.assignedComponentId) {
      const componentTitle = getComponentDisplayById(subTask.assignedComponentId) || subTask.assignedComponentTitle || 'Bauteil';
      scope = ` → 🔧 ${componentTitle}`;
    } else if (subTask.scopeType === 'order') {
      scope = ' → 📋 Gesamtauftrag';
    }
    
    return assignedUser + scope;
  };

  // PDF generieren und herunterladen
  const handlePrintOrder = async () => {
    try {
      setIsGeneratingPDF(true);
      
      const pdfGenerator = new OrderPDFGenerator(localOrder, {
        includeDocuments: true,
        includeComponents: true,
        includeQRCode: true
      });

      // PDF als Blob generieren (verwendet generateCombinedPDF für Blob-Output)
      const pdfBlob = await pdfGenerator.generateCombinedPDF();
      
      // PDF herunterladen
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Auftrag_${localOrder.orderNumber || localOrder.id}_${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      dispatch({ 
        type: 'SHOW_NOTIFICATION', 
        payload: { message: 'PDF erfolgreich erstellt!', type: 'success' } 
      });
    } catch (error) {
      console.error('Fehler beim Erstellen der PDF:', error);
      dispatch({ 
        type: 'SHOW_NOTIFICATION', 
        payload: { message: 'Fehler beim Erstellen der PDF!', type: 'error' } 
      });
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="flex justify-between items-center p-6 border-b">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{localOrder.title}</h2>
            <p className="text-gray-600 mt-1">Auftrags-Nr.: {localOrder.orderNumber || localOrder.id}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowNetworkFolder(true)}
              className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors flex items-center"
              title="Netzwerkordner verwalten"
            >
              <Server className="w-4 h-4 mr-2" />
              Netzwerkordner
            </button>
            <button
              onClick={handlePrintOrder}
              disabled={isGeneratingPDF}
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400 transition-colors flex items-center"
              title="PDF mit QR-Code erstellen (scanbar mit Handy/Scanner zum direkten Öffnen)"
            >
              <Printer className="w-4 h-4 mr-2" />
              {isGeneratingPDF ? 'Erstelle PDF...' : 'PDF + QR-Code'}
            </button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Linke Spalte: Auftragsdetails */}
            <div className="md:col-span-2 space-y-6">

              {/* Titelbild Sektion */}
              <div className="bg-white p-6 rounded-lg shadow-sm border">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Titelbild</h3>
                <div className="flex items-center gap-6">
                  {titleImageUrl ? (
                    <img 
                      src={titleImageUrl} 
                      alt="Titelbild" 
                      className="w-32 h-32 object-cover rounded-lg shadow-md"
                      onError={() => {
                        console.error('Image failed to load:', titleImageUrl);
                        setTitleImageUrl(''); // Clear the URL on error
                      }}
                      onLoad={() => {
                        // Image loaded successfully
                      }}
                    />
                  ) : (
                    <div className="w-32 h-32 bg-gray-200 rounded-lg flex items-center justify-center text-gray-500 text-center p-2">
                      Kein Titelbild
                    </div>
                  )}
                  <div className="flex flex-col gap-2">
                    <label htmlFor="title-image-input" className="cursor-pointer bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm text-center">
                      {titleImageUrl ? 'Bild ändern' : 'Bild hochladen'}
                    </label>
                    <input
                      id="title-image-input"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleTitleImageInputChange}
                    />
                    {titleImageUrl && (
                      <button
                        onClick={removeTitleImage}
                        className="text-sm text-red-600 hover:text-red-800"
                      >
                        Entfernen
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Auftragsinformationen */}
              <div className="bg-white p-6 rounded-lg shadow-sm border">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Auftragsinformationen</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <span className="text-sm text-gray-600">Status:</span>
                    <span className={`block px-2 py-1 text-xs rounded-full ${getStatusColor(localOrder.status)}`}>
                      {getStatusText(localOrder.status)}
                    </span>
                  </div>
                  <div>
                    <span className="text-sm text-gray-600">Auftraggeber:</span>
                    <span className="text-sm font-medium text-gray-900">{localOrder.clientName}</span>
                  </div>
                  <div>
                    <span className="text-sm text-gray-600">Deadline:</span>
                    <span className="text-sm font-medium text-gray-900">
                      {new Date(localOrder.deadline).toLocaleDateString('de-DE')}
                    </span>
                  </div>
                  <div>
                    <span className="text-sm text-gray-600">Kostenstelle:</span>
                    <span className="text-sm font-medium text-gray-900">{localOrder.costCenter}</span>
                  </div>
                  <div>
                    <span className="text-sm text-gray-600">Priorität:</span>
                    <span className="text-sm font-medium text-gray-900">{localOrder.priority}</span>
                  </div>
                </div>
              </div>

              {/* Netzwerkordner-Status */}
              <div className="mt-4">
                <h4 className="text-md font-semibold text-gray-900 mb-2">Netzwerkordner-Status</h4>
                <NetworkFolderStatus 
                  orderId={localOrder.id}
                  orderNumber={localOrder.orderNumber}
                />
              </div>

              {/* Netzwerkdateien */}
              <div className="mt-4">
                <NetworkFilesViewer 
                  orderId={localOrder.id}
                />
              </div>

              <div>
                <h4 className="text-md font-semibold text-gray-900 mb-2">Beschreibung</h4>
                <p className="text-gray-700 bg-gray-50 rounded-lg p-4">{localOrder.description}</p>
              </div>

              {/* Revision History (Werkstatt an Kunde) */}
              {localOrder.revisionHistory && Array.isArray(localOrder.revisionHistory) && localOrder.revisionHistory.length > 0 && (
                <div>
                  <h4 className="text-md font-semibold text-gray-900 mb-2">Werkstatt-Kommentare</h4>
                  <div className="space-y-3 bg-orange-50 rounded-lg p-4 border border-orange-200">
                    {localOrder.revisionHistory.map((entry: any, index: number) => (
                      <div key={index} className="p-3 bg-white rounded-md shadow-sm">
                        <p className="text-sm text-gray-800 whitespace-pre-wrap">{entry.comment}</p>
                        <p className="text-xs text-gray-500 mt-2">
                          <strong>{entry.userName}</strong> am {new Date(entry.createdAt).toLocaleString('de-DE')}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Rework Comments (Kunde an Werkstatt) */}
              {localOrder.reworkComments && Array.isArray(localOrder.reworkComments) && localOrder.reworkComments.length > 0 && (
                <div>
                  <h4 className="text-md font-semibold text-gray-900 mb-2">Kunden-Kommentare zur Nacharbeit</h4>
                  <div className="space-y-3 bg-blue-50 rounded-lg p-4 border border-blue-200">
                    {localOrder.reworkComments.map((entry: any, index: number) => (
                      <div key={index} className="p-3 bg-white rounded-md shadow-sm">
                        <p className="text-sm text-gray-800 whitespace-pre-wrap">{entry.comment}</p>
                        <p className="text-xs text-gray-500 mt-2">
                          <strong>{entry.userName}</strong> am {new Date(entry.createdAt).toLocaleString('de-DE')}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h4 className="text-md font-semibold text-gray-900 mb-2">Dokumente</h4>
                {localOrder.documents && localOrder.documents.length > 0 ? (
                  <div className="space-y-2">
                    {localOrder.documents.map((doc) => (
                      <div key={doc.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center">
                          {getFileIcon(doc.name)}
                          <div className="ml-3">
                            <span className="text-sm text-gray-900">{doc.name}</span>
                            <div className="text-xs text-gray-500 mt-1">
                              {getFileTypeDescription(doc.name)}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          {isSTLFile(doc.name) && (
                            <button
                              onClick={() => toggleSTLViewer(doc.id)}
                              className="inline-flex items-center px-2 py-1 text-xs font-medium text-purple-600 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded transition-colors"
                              title="3D-Ansicht"
                            >
                              <Server className="w-3 h-3 mr-1" />
                              {showSTLViewers[doc.id] ? '3D ausblenden' : '3D anzeigen'}
                            </button>
                          )}
                          <button
                            onClick={() => handleDownload(doc)}
                            className="text-blue-600 hover:text-blue-800 transition-colors flex items-center"
                          >
                            <Download className="w-4 h-4 mr-1" />
                            <span className="text-sm">Download</span>
                          </button>
                        </div>
                      </div>
                    ))}
                    
                    {/* STL Viewers */}
                    {localOrder.documents
                      .filter(doc => isSTLFile(doc.name) && showSTLViewers[doc.id])
                      .map((doc) => (
                        <div key={`viewer-${doc.id}`} className="mt-2 p-4 bg-gray-50 rounded-lg">
                          <STLViewer
                            fileUrl={`${doc.url}`}
                            fileName={doc.name}
                            className="w-full"
                            showControls={true}
                          />
                        </div>
                      ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm">Keine Dokumente hochgeladen</p>
                )}
              </div>

              {/* Bauteile-Bereich */}
              {localOrder.components && localOrder.components.length > 0 && (
                <div>
                  <h4 className="text-md font-semibold text-gray-900 mb-2">Bauteile</h4>
                  <div className="space-y-4">
                    {localOrder.components.map((component) => {
                      // Use _id if id is not available (backwards compatibility)
                      const componentId = component.id || (component as any)._id;
                      // Use title if available, otherwise name (backwards compatibility)  
                      const componentTitle = component.title || (component as any).name || 'Unbenanntes Bauteil';
                      return (
                      <div key={componentId} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                        <div className="mb-3">
                          <h5 className="font-medium text-gray-900 text-sm">{componentTitle}</h5>
                          <div className="text-gray-600 text-sm mt-1 flex flex-wrap gap-x-4 gap-y-1">
                            <span>Anzahl: {component.quantity || 1}</span>
                            {component.material && <span>Material: {component.material}</span>}
                          </div>
                          {component.description && (
                            <p className="text-gray-600 text-sm mt-2">{component.description}</p>
                          )}
                        </div>
                        
                        {component.documents && component.documents.length > 0 && (
                          <div>
                            <h6 className="text-xs font-medium text-gray-700 mb-2">Dokumente:</h6>
                            <div className="space-y-1">
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
                              {component.documents
                                .filter(doc => isSTLFile(doc.name) && showSTLViewers[doc.id])
                                .map((doc) => (
                                  <div key={`viewer-${doc.id}`} className="mt-2 p-4 bg-gray-50 rounded-lg">
                                    <STLViewer
                                      fileUrl={`${doc.url}`}
                                      fileName={doc.name}
                                      className="w-full"
                                      showControls={true}
                                    />
                                  </div>
                                ))}
                            </div>
                          </div>
                        )}
                        
                        {/* Component Upload Section */}
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          <button
                            onClick={() => {
                              if (showComponentUpload && activeComponentId === componentId) {
                                setShowComponentUpload(false);
                                setActiveComponentId(null);
                              } else {
                                setShowComponentUpload(true);
                                setActiveComponentId(componentId);
                              }
                            }}
                            className="flex items-center text-xs text-blue-600 hover:text-blue-800"
                          >
                            {showComponentUpload && activeComponentId === componentId ? (
                              <><X className="w-3 h-3 mr-1" /> Abbrechen</>
                            ) : (
                              <><Plus className="w-3 h-3 mr-1" /> Datei hochladen</>
                            )}
                          </button>
                          
                          {showComponentUpload && activeComponentId === componentId && (
                            <div className="mt-3">
                              <NetworkDragDropUpload
                                orderId={localOrder.id}
                                uploadType="document"
                                targetFolder="Bauteile"
                                onUploadSuccess={(fileName) => {
                                  setShowComponentUpload(false);
                                  setActiveComponentId(null);
                                  dispatch({
                                    type: 'SHOW_NOTIFICATION',
                                    payload: {
                                      message: `Bauteil-Dokument "${fileName}" erfolgreich hochgeladen`,
                                      type: 'success'
                                    }
                                  });
                                  
                                  // Reload order to get updated components with documents
                                  fetch(`/api/orders/${localOrder.id}`)
                                    .then(response => response.json())
                                    .then(updatedOrder => {
                                      dispatch({ type: 'UPDATE_ORDER', payload: updatedOrder });
                                      setLocalOrder(updatedOrder);
                                      // Dokumente und Komponenten zu changedFields hinzufügen
                                      setChangedFields(prev => ({
                                        ...prev,
                                        documents: updatedOrder.documents,
                                        components: updatedOrder.components
                                      }));
                                    })
                                    .catch(error => {
                                      console.error('Error reloading order:', error);
                                    });
                                }}
                                onUploadError={(error) => {
                                  dispatch({
                                    type: 'SHOW_NOTIFICATION',
                                    payload: {
                                      message: `Upload-Fehler: ${error}`,
                                      type: 'error'
                                    }
                                  });
                                }}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Right Column */}
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Arbeitsbereich</h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Zugewiesen an
                    </label>
                    <select
                      value={assignedTo}
                      onChange={(e) => handleFieldChange('assignedTo', e.target.value || null)}
                      disabled={!canModify && state.currentUser?.role !== 'admin'}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                    >
                      <option value="">Nicht zugewiesen</option>
                      {state.workshopAccounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Geschätzte Stunden
                      </label>
                      <input
                        type="number"
                        value={estimatedHours}
                        onChange={(e) => handleFieldChange('estimatedHours', e.target.value)}
                        disabled={!canModify && state.currentUser?.role !== 'admin'}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                        min="0"
                        step="0.5"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Tatsächliche Stunden
                      </label>
                      <input
                        type="number"
                        value={actualHours}
                        onChange={(e) => handleFieldChange('actualHours', e.target.value)}
                        disabled={!canModify && state.currentUser?.role !== 'admin'}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                        min="0"
                        step="0.5"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Notizen
                    </label>
                    <textarea
                      value={notes}
                      onChange={(e) => handleFieldChange('notes', e.target.value)}
                      disabled={!canEditNotes}
                      rows={4}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                      placeholder="Notizen und Kommentare..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Interne Werkstattnotiz
                    </label>
                    <textarea
                      value={internalWorkshopNote}
                      onChange={(e) => handleFieldChange('internalWorkshopNote', e.target.value)}
                      disabled={!canEditNotes}
                      rows={4}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                      placeholder="Nur für Werkstatt/Admin sichtbar..."
                    />
                  </div>

                  {/* Materialstatus Sektion */}
                  <div className="bg-gray-50 rounded-lg p-4 border">
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                      📦 Materialstatus
                    </label>
                    <div className="space-y-3">
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={localOrder.materialAvailable || false}
                          onChange={(e) => handleFieldChange('materialAvailable', e.target.checked)}
                          disabled={!canModify && state.currentUser?.role !== 'admin'}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded disabled:opacity-50"
                        />
                        <span className="ml-3 text-sm text-gray-700">
                          ✅ Material vorhanden
                        </span>
                      </label>
                      
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={localOrder.materialOrderedByWorkshop || false}
                          onChange={(e) => handleFieldChange('materialOrderedByWorkshop', e.target.checked)}
                          disabled={!canModify && state.currentUser?.role !== 'admin'}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded disabled:opacity-50"
                        />
                        <span className="ml-3 text-sm text-gray-700">
                          🏭 Material durch Werkstatt bestellt
                        </span>
                      </label>
                      
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={localOrder.materialOrderedByClient || false}
                          onChange={(e) => handleFieldChange('materialOrderedByClient', e.target.checked)}
                          disabled={!canModify && state.currentUser?.role !== 'admin'}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded disabled:opacity-50"
                        />
                        <span className="ml-3 text-sm text-gray-700">
                          👤 Material selbst bestellen
                        </span>
                        {localOrder.materialOrderedByClient && localOrder.materialOrderedByClientConfirmed && (
                          <span className="ml-2 px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">
                            ✓ Bestätigt
                          </span>
                        )}
                      </label>
                      
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={!localOrder.materialAvailable && !localOrder.materialOrderedByWorkshop && !localOrder.materialOrderedByClient}
                          onChange={(e) => {
                            if (e.target.checked) {
                              // Wenn "kein Material benötigt" aktiviert wird, alle anderen deaktivieren
                              handleFieldChange('materialAvailable', false);
                              handleFieldChange('materialOrderedByWorkshop', false);
                              handleFieldChange('materialOrderedByClient', false);
                            }
                          }}
                          disabled={!canModify && state.currentUser?.role !== 'admin'}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded disabled:opacity-50"
                        />
                        <span className="ml-3 text-sm text-gray-700">
                          ❌ Kein Material benötigt
                        </span>
                      </label>
                    </div>
                  </div>

                  <button
                    onClick={handleSave}
                    disabled={Object.keys(changedFields).length === 0}
                    className="w-full mt-4 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    Änderungen speichern
                  </button>

                  {/* Notiz-Historie */}
                  {localOrder.noteHistory && localOrder.noteHistory.length > 0 && (
                    <div>
                      <h4 className="text-md font-semibold text-gray-900 mt-4 mb-2">Notiz-Verlauf</h4>
                      <div className="space-y-3 bg-gray-50 rounded-lg p-4 max-h-48 overflow-y-auto">
                        {localOrder.noteHistory.map((entry: NoteHistory) => (
                          <div key={entry.id} className="p-3 bg-white rounded-md shadow-sm border">
                            <p className="text-sm text-gray-800 whitespace-pre-wrap">{entry.notes}</p>
                            <p className="text-xs text-gray-500 mt-2">
                              {new Date(entry.createdAt).toLocaleString('de-DE')}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {(canModify || state.currentUser?.role === 'admin') && (
                <div className="border-t pt-6">
                  <h4 className="text-md font-semibold text-gray-900 mb-4">Aktionen</h4>
                  <div className="grid grid-cols-2 gap-3">
                    {localOrder.status === 'pending' && (
                      <>
                        <button
                          onClick={() => handleStatusChange('accepted')}
                          className="flex items-center justify-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                        >
                          <Check className="w-4 h-4 mr-2" />
                          Annehmen
                        </button>
                        <button
                          onClick={() => handleStatusChange('revision')}
                          className="flex items-center justify-center px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
                        >
                          <RotateCcw className="w-4 h-4 mr-2" />
                          Überarbeitung
                        </button>
                      </>
                    )}
                    
                    {localOrder.status === 'accepted' || localOrder.status === 'rework' ? (
                      <button
                        onClick={() => handleStatusChange('in_progress')}
                        className="flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        <Clock className="w-4 h-4 mr-2" />
                        Starten
                      </button>
                    ) : null}
                    
                    {localOrder.status === 'in_progress' && (
                      <button
                        onClick={() => {
                          if (!allSubTasksCompleted()) {
                            dispatch({ 
                              type: 'SHOW_NOTIFICATION', 
                              payload: { 
                                message: 'Auftrag kann nicht abgeschlossen werden: Nicht alle Unteraufgaben sind erledigt!', 
                                type: 'error' 
                              } 
                            });
                            return;
                          }
                          handleStatusChange('waiting_confirmation');
                        }}
                        disabled={!allSubTasksCompleted()}
                        className={`flex items-center justify-center px-4 py-2 rounded-lg transition-colors ${
                          allSubTasksCompleted() 
                            ? 'bg-green-600 text-white hover:bg-green-700' 
                            : 'bg-gray-400 text-gray-200 cursor-not-allowed'
                        }`}
                        title={!allSubTasksCompleted() ? 'Alle Unteraufgaben müssen erledigt sein' : ''}
                      >
                        <Check className="w-4 h-4 mr-2" />
                        Zur Abnahme freigeben
                      </button>
                    )}
                    
                    {localOrder.status === 'completed' && state.currentUser?.role === 'admin' && (
                      <button
                        onClick={handleArchive}
                        className="flex items-center justify-center px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                      >
                        <Archive className="w-4 h-4 mr-2" />
                        Archivieren
                      </button>
                    )}
                    
                    <button
                      onClick={() => handleStatusChange('revision')}
                      className="flex items-center justify-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      Ablehnen
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Sub-tasks Section */}
          <div className="mt-8 border-t pt-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Unteraufgaben</h3>
              {(canModify || state.currentUser?.role === 'admin') && (
                <button
                  onClick={() => setShowAddSubTask(true)}
                  className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Unteraufgabe hinzufügen
                </button>
              )}
            </div>

            {showAddSubTask && (
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <input
                    type="text"
                    placeholder="Titel der Unteraufgabe"
                    value={subTaskTitle}
                    onChange={(e) => setSubTaskTitle(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <input
                    type="number"
                    placeholder="Geschätzte Stunden"
                    value={subTaskHours}
                    onChange={(e) => setSubTaskHours(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    min="0"
                    step="0.5"
                  />
                  
                  {/* Mitarbeiter-Auswahl (Pflichtfeld) */}
                  <select
                    value={subTaskAssignedTo}
                    onChange={e => setSubTaskAssignedTo(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  >
                    <option value="">Mitarbeiter auswählen *</option>
                    {state.workshopAccounts.filter(acc => acc.role === 'workshop' || acc.role === 'admin').map(acc => (
                      <option key={acc.id} value={acc.id}>{acc.name}</option>
                    ))}
                  </select>
                  
                  {/* Scope-Auswahl */}
                  <select
                    value={subTaskScopeType}
                    onChange={e => setSubTaskScopeType(e.target.value as 'order' | 'component')}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="order">Gesamter Auftrag</option>
                    <option value="component">Bauteil</option>
                  </select>
                  
                  {/* Bauteil-Auswahl (nur bei scopeType='component') */}
                  {subTaskScopeType === 'component' && (
                    <div className="md:col-span-2">
                      <select
                        value={subTaskAssignedComponentId}
                        onChange={e => setSubTaskAssignedComponentId(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="">Bauteil auswählen</option>
                        {localOrder.components?.map(comp => {
                          const compId = comp.id || (comp as any)._id;
                          const compTitle = comp.title || (comp as any).name || 'Unbenanntes Bauteil';
                          return (
                            <option key={compId} value={compId}>{compTitle}</option>
                          );
                        })}
                      </select>
                    </div>
                  )}
                </div>
                <textarea
                  placeholder="Beschreibung der Unteraufgabe"
                  value={subTaskDescription}
                  onChange={(e) => setSubTaskDescription(e.target.value)}
                  rows={2}
                  className="w-full mt-2 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                {/* PDF Upload for Subtasks */}
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    PDF Dokumente für Unteraufgabe
                  </label>
                  
                  {/* New Network File Upload Component */}
                  <NetworkDragDropUpload
                    orderId={localOrder.id}
                    uploadType="document"
                    targetFolder="Dokumente"
                    acceptedTypes={['.pdf']}
                    onUploadSuccess={(fileName) => {
                      dispatch({
                        type: 'SHOW_NOTIFICATION',
                        payload: {
                          message: `Dokument "${fileName}" erfolgreich hochgeladen`,
                          type: 'success'
                        }
                      });
                      
                      // Reload order to get updated documents
                      fetch(`/api/orders/${localOrder.id}`)
                        .then(response => response.json())
                        .then(data => {
                          setLocalOrder(data);
                        })
                        .catch(error => {
                          console.error('Error reloading order:', error);
                        });
                    }}
                    onUploadError={(error) => {
                      dispatch({
                        type: 'SHOW_NOTIFICATION',
                        payload: {
                          message: `Fehler beim Hochladen: ${error}`,
                          type: 'error'
                        }
                      });
                    }}
                  />
                  
                  {/* Show uploaded files */}
                  {subTaskDocuments.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {subTaskDocuments.map(doc => (
                        <div key={doc.id} className="flex items-center justify-between p-2 bg-white rounded border">
                          <div className="flex items-center">
                            <FileText className="w-4 h-4 text-red-600 mr-2" />
                            <span className="text-sm text-gray-900">{doc.name}</span>
                          </div>
                          <button
                            onClick={() => removeSubTaskDocument(doc.id)}
                            className="text-red-600 hover:text-red-800 transition-colors flex items-center"
                          >
                            <X className="w-3 h-3 mr-1" />
                            <span className="text-xs">Entfernen</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex justify-end space-x-2 mt-4">
                  <button
                    onClick={() => {
                      setShowAddSubTask(false);
                      setSubTaskDocuments([]);
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Abbrechen
                  </button>
                  <button
                    onClick={handleAddSubTask}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Hinzufügen
                  </button>
                </div>
              </div>
            )}

            {/* Subtasks sicher abfragen */}
            {Array.isArray(localOrder.subTasks) && localOrder.subTasks.length > 0 ? (
              <div className="space-y-3">
                {localOrder.subTasks.map((subTask) => (
                  <div key={subTask.id} className="bg-gray-50 rounded-lg p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <h4 className="font-medium text-gray-900">{subTask.title}</h4>
                        <p className="text-sm text-gray-600 mt-1">{subTask.description}</p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(subTask.status)}`}>
                          {getStatusText(subTask.status)}
                        </span>
                        {(canModify || state.currentUser?.role === 'admin') && (
                          <button
                            onClick={() => handleDeleteSubTask(subTask.id)}
                            className="text-red-600 hover:text-red-800"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                    
                    {/* Subtask Documents */}
                    {subTask.documents.length > 0 && (
                      <div className="mb-3">
                        <h5 className="text-sm font-medium text-gray-700 mb-2">Dokumente:</h5>
                        <div className="space-y-1">
                          {subTask.documents.map((doc) => (
                            <div key={doc.id} className="flex items-center justify-between p-2 bg-white rounded border">
                              <div className="flex items-center">
                                <FileText className="w-4 h-4 text-red-600 mr-2" />
                                <span className="text-sm text-gray-900">{doc.name}</span>
                              </div>
                              <button
                                onClick={() => handleDownload(doc)}
                                className="text-blue-600 hover:text-blue-800 transition-colors flex items-center"
                              >
                                <Download className="w-3 h-3 mr-1" />
                                <span className="text-xs">Download</span>
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    <div className="grid grid-cols-3 gap-4 text-sm mb-3">
                      <div>
                        <span className="text-gray-600">Geschätzt: </span>
                        <span className="font-medium">{subTask.estimatedHours}h</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Tatsächlich: </span>
                        <span className="font-medium">{subTask.actualHours}h</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Zugewiesen: </span>
                        <span className="font-medium">
                          {getAssignmentDisplay(subTask)}
                        </span>
                      </div>
                    </div>

                    <div className="flex justify-between items-center">
                      <div className="flex space-x-2 flex-wrap">
                        {/* Mitarbeiter-Zuweisung (Pflichtfeld) */}
                        <select
                          value={subTask.assignedTo || ''}
                          onChange={(e) => handleUpdateSubTask(subTask, { assignedTo: e.target.value || null })}
                          disabled={!canModify && state.currentUser?.role !== 'admin'}
                          className="text-xs px-2 py-1 border border-gray-300 rounded disabled:bg-gray-100"
                        >
                          <option value="">Mitarbeiter auswählen</option>
                          {state.workshopAccounts.filter(acc => acc.role === 'workshop' || acc.role === 'admin').map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.name}
                            </option>
                          ))}
                        </select>
                        
                        {/* Scope-Auswahl */}
                        <select
                          value={subTask.scopeType || 'order'}
                          onChange={(e) => {
                            const newScopeType = e.target.value as 'order' | 'component';
                            let updates: Partial<SubTask> = { 
                              scopeType: newScopeType,
                              assignedComponentId: newScopeType === 'order' ? null : subTask.assignedComponentId,
                              assignedComponentTitle: newScopeType === 'order'
                                ? null
                                : (getComponentDisplayById(subTask.assignedComponentId) || subTask.assignedComponentTitle || 'Bauteil')
                            };
                            handleUpdateSubTask(subTask, updates);
                          }}
                          disabled={!canModify && state.currentUser?.role !== 'admin'}
                          className="text-xs px-2 py-1 border border-gray-300 rounded disabled:bg-gray-100"
                        >
                          <option value="order">Gesamtauftrag</option>
                          <option value="component">Bauteil</option>
                        </select>
                        
                        {/* Bauteil-Auswahl (nur bei scopeType='component') */}
                        {subTask.scopeType === 'component' && (
                          <select
                            value={subTask.assignedComponentId || ''}
                            onChange={(e) => {
                              const selectedComponentId = e.target.value || null;
                              handleUpdateSubTask(subTask, {
                                assignedComponentId: selectedComponentId,
                                assignedComponentTitle: selectedComponentId ? (getComponentDisplayById(selectedComponentId) || 'Bauteil') : null
                              });
                            }}
                            disabled={!canModify && state.currentUser?.role !== 'admin'}
                            className="text-xs px-2 py-1 border border-gray-300 rounded disabled:bg-gray-100"
                          >
                            <option value="">Bauteil auswählen</option>
                            {localOrder.components?.map((comp) => {
                              const compId = comp.id || (comp as any)._id;
                              const compTitle = comp.title || (comp as any).name || 'Unbenanntes Bauteil';
                              return (
                                <option key={compId} value={compId}>
                                  {compTitle}
                                </option>
                              );
                            })}
                          </select>
                        )}
                        
                        <select
                          value={subTask.status}
                          onChange={(e) => handleUpdateSubTask(subTask, { status: e.target.value as SubTask['status'] })}
                          disabled={!canModify && state.currentUser?.role !== 'admin' && subTask.assignedTo !== state.currentUser?.id}
                          className="text-xs px-2 py-1 border border-gray-300 rounded disabled:bg-gray-100"
                        >
                          <option value="pending">Ausstehend</option>
                          <option value="in_progress">In Bearbeitung</option>
                          <option value="completed">Abgeschlossen</option>
                        </select>
                      </div>
                      
                      <input
                        type="number"
                        placeholder="Tats. Stunden"
                        value={subTask.actualHours}
                        onChange={(e) => handleUpdateSubTask(subTask, { actualHours: parseFloat(e.target.value) || 0 })}
                        disabled={!canModify && state.currentUser?.role !== 'admin' && subTask.assignedTo !== state.currentUser?.id}
                        className="w-20 text-xs px-2 py-1 border border-gray-300 rounded disabled:bg-gray-100"
                        min="0"
                        step="0.5"
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8">Keine Unteraufgaben vorhanden</p>
            )}
          </div>
        </div>
        {/* Löschen-Button für Admin unten zentriert */}
        {state.currentUser?.role === 'admin' && (
          <div className="flex justify-center mt-12 mb-2">
            <button
              onClick={handleDeleteOrder}
              className="px-6 py-3 bg-red-600 text-white rounded-lg shadow hover:bg-red-700 transition-colors text-lg font-semibold"
              title="Auftrag löschen"
            >
              <Trash2 className="w-5 h-5 mr-2 inline" /> Auftrag löschen
            </button>
          </div>
        )}
      </div>

      {/* Revision-Kommentar Dialog */}
      {showRevisionDialog && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-2">Kommentar zur Nacharbeit</h3>
            <textarea
              className="w-full border border-gray-300 rounded-lg p-2 mb-2"
              rows={4}
              value={revisionComment}
              onChange={e => setRevisionComment(e.target.value)}
              placeholder="Bitte geben Sie einen Kommentar zur Nacharbeit ein..."
              autoFocus
            />
            {revisionError && <div className="text-red-600 text-sm mb-2">{revisionError}</div>}
            <div className="flex justify-end space-x-2">
              <button
                className="px-4 py-2 border rounded-lg text-gray-700"
                onClick={() => { setShowRevisionDialog(false); setRevisionError(''); }}
              >Abbrechen</button>
              <button
                className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700"
                onClick={submitRevision}
              >Absenden</button>
            </div>
          </div>
        </div>
      )}

      {/* Nacharbeits-Kommentare Verlauf */}
      {localOrder.revisionHistory && localOrder.revisionHistory.length > 0 && (
        <div className="mt-6">
          <h4 className="text-md font-semibold text-gray-900 mb-2">Nacharbeits-Kommentare</h4>
          <div className="space-y-2">
            {localOrder.revisionHistory.map((entry: RevisionComment, idx: number) => (
              <div key={idx} className="bg-orange-50 border-l-4 border-orange-400 p-3 rounded">
                <div className="text-sm text-gray-800 mb-1">{entry.comment}</div>
                <div className="text-xs text-gray-500">{entry.userName} am {new Date(entry.createdAt).toLocaleString('de-DE')}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Netzwerkordner Modal */}
      {showNetworkFolder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-lg shadow-lg max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Netzwerkordner für Auftrag {localOrder.orderNumber}</h2>
              <button 
                onClick={() => setShowNetworkFolder(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <NetworkFolderStatus 
              orderId={localOrder.id} 
              orderNumber={localOrder.orderNumber}
            />
            <div className="mt-6">
              <NetworkFilesViewer 
                orderId={localOrder.id}
              />
            </div>
          </div>
        </div>
      )}

      {/* Dateiupload Bereich */}
      <div className="mt-6 border-t pt-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Dateiupload</h3>
        <NetworkDragDropUpload
          orderId={localOrder.id}
          uploadType="cam"
          targetFolder="Dateien"
          onUploadSuccess={(fileName) => {
            dispatch({
              type: 'SHOW_NOTIFICATION',
              payload: {
                message: `Datei "${fileName}" erfolgreich hochgeladen`,
                type: 'success'
              }
            });
            
            // Reload order to update documents
            fetch(`/api/orders/${localOrder.id}`)
              .then(response => response.json())
              .then(data => {
                setLocalOrder(data);
              })
              .catch(error => {
                console.error('Error reloading order:', error);
              });
          }}
          onUploadError={(error) => {
            dispatch({
              type: 'SHOW_NOTIFICATION',
              payload: {
                message: `Upload-Fehler: ${error}`,
                type: 'error'
              }
            });
          }}
        />
      </div>
    </div>
  );
}