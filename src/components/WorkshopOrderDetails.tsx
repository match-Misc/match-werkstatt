import { useState, useEffect } from 'react';
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
  Eye,
  Box,
  PenTool,
  Edit2,
  Save,
  ToggleLeft,
  ToggleRight,
  ArrowRight,
  Wrench
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

  const [activeTab, setActiveTab] = useState<'dashboard' | 'order_info' | 'components' | 'subtasks' | 'internal_files'>('dashboard');
  const [autoCalculateHours, setAutoCalculateHours] = useState(true);
  const [editingSubTaskId, setEditingSubTaskId] = useState<string | null>(null);
  const [editSubTaskForm, setEditSubTaskForm] = useState<{title: string, description: string, estimatedHours: string, assignedTo: string | null, scopeType: 'order' | 'component', assignedComponentIds: string[]}>({title: '', description: '', estimatedHours: '0', assignedTo: null, scopeType: 'order', assignedComponentIds: []});

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
  const [subTaskAssignedComponentIds, setSubTaskAssignedComponentIds] = useState<string[]>([]);
  const [showSTLViewers, setShowSTLViewers] = useState<{[key: string]: boolean}>({});
  const [showComponentUpload, setShowComponentUpload] = useState(false);
  const [activeComponentId, setActiveComponentId] = useState<string | null>(null);
  const [internalFilesRefreshTrigger, setInternalFilesRefreshTrigger] = useState(0);

  const toggleSTLViewer = (docId: string) => {
    setShowSTLViewers(prev => ({
      ...prev,
      [docId]: !prev[docId]
    }));
  };

  const isSTLFile = (fileName: string) => {
    return /\.stl$/i.test(fileName);
  };

  const isIPTFile = (fileName: string) => {
    return /\.(ipt|iam)$/i.test(fileName);
  };

  const isDWGFile = (fileName: string) => {
    return /\.dwg$/i.test(fileName);
  };

  const getFileIcon = (fileName: string, className = "w-5 h-5") => {
    if (isSTLFile(fileName)) return <Server className={`${className} text-purple-600`} />;
    if (isIPTFile(fileName)) return <Box className={`${className} text-orange-500`} />;
    if (isDWGFile(fileName)) return <PenTool className={`${className} text-blue-500`} />;
    return <FileText className={`${className} text-red-600`} />;
  };

  const getFileTypeDescription = (fileName: string) => {
    if (isSTLFile(fileName)) return '3D-Modell (STL)';
    if (isIPTFile(fileName)) return 'CAD-Modell (IPT/IAM)';
    if (isDWGFile(fileName)) return 'Zeichnung (DWG)';
    return 'PDF-Dokument';
  };
  const [showRevisionDialog, setShowRevisionDialog] = useState(false);
  const [revisionComment, setRevisionComment] = useState('');
  const [revisionError, setRevisionError] = useState('');
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [showNetworkFolder, setShowNetworkFolder] = useState(false);

  // Zustand für bearbeitete Felder
  const [changedFields, setChangedFields] = useState<Partial<Order>>({});

  const getDisplayPath = (doc: any) => {
    if (!doc.url) return doc.name;
    let decoded = decodeURIComponent(doc.url);
    let path = decoded.replace(/^\/(?:uploads|network-files)\//, '');
    path = path.replace(/uploads\/?/gi, '');
    if (path.startsWith('/')) path = path.substring(1);
    return path || doc.name;
  };

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

  // Automatische Synchronisation des physischen Ordners mit der Datenbank
  useEffect(() => {
    let isMounted = true;
    
    const syncFolder = async () => {
      try {
        const syncRes = await fetch(`/api/orders/${order.id}/sync`, { method: 'POST' });
        const syncData = await syncRes.json();
        
        // Wenn Dateien hinzugefügt oder entfernt wurden, Auftrag neu laden
        if (syncData.success && (syncData.added > 0 || syncData.deleted > 0) && isMounted) {
          const freshRes = await fetch(`/api/orders/${order.id}`);
          if (freshRes.ok) {
            const freshOrder = await freshRes.json();
            dispatch({ type: 'UPDATE_ORDER', payload: freshOrder });
          }
        }
      } catch (err) {
        console.error('Fehler bei der Ordner-Synchronisation:', err);
      }
    };

    // Sofort beim Öffnen syncen
    syncFolder();
    
    // Alle 3 Sekunden prüfen (Live-Sync, solange das Fenster offen ist)
    const intervalId = setInterval(syncFolder, 3000);
    
    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [order.id, dispatch]);

  // Sync hours to local input states when they are updated externally (e.g. from subtasks)
  useEffect(() => {
    setEstimatedHours(localOrder.estimatedHours?.toString() || '0');
    setActualHours(localOrder.actualHours?.toString() || '0');
  }, [localOrder.estimatedHours, localOrder.actualHours]);

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
            case 'components':
                // Aktualisiere direkt den lokalen Order-State für Checkboxen & Komponenten
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
                               (state.currentUser?.role === 'employee' || state.currentUser?.role === 'manager');
        
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
      assignedComponentIds: subTaskScopeType === 'component' ? subTaskAssignedComponentIds : [],
      assignedComponentTitles: subTaskScopeType === 'component' ? subTaskAssignedComponentIds.map(id => getComponentDisplayById(id) || 'Bauteil') : [],
      notes: '',
      documents: subTaskDocuments,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    const nextSubTasks = [...localOrder.subTasks, newSubTask];
    const payload: Partial<Order> = {
      subTasks: nextSubTasks,
      updatedAt: new Date()
    };
    if (autoCalculateHours) {
      const autoHours = calculateHoursFromSubTasks(nextSubTasks);
      payload.estimatedHours = autoHours.estimatedHours;
      payload.actualHours = autoHours.actualHours;
    }
    await updateOrder(payload, 'Unteraufgabe wurde erfolgreich hinzugefügt');
    setSubTaskTitle('');
    setSubTaskDescription('');
    setSubTaskHours('');
    setSubTaskAssignedTo('');
    setSubTaskScopeType('order');
    setSubTaskAssignedComponentIds([]);
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
    const payload: Partial<Order> = {
      subTasks: nextSubTasks,
      updatedAt: new Date()
    };
    if (autoCalculateHours) {
      const autoHours = calculateHoursFromSubTasks(nextSubTasks);
      payload.estimatedHours = autoHours.estimatedHours;
      payload.actualHours = autoHours.actualHours;
    }
    await updateOrder(payload, 'Unteraufgabe aktualisiert');
  };

  const handleDeleteSubTask = async (subTaskId: string) => {
    if (confirm('Sind Sie sicher, dass Sie diese Unteraufgabe löschen möchten?')) {
      const nextSubTasks = localOrder.subTasks.filter(st => st.id !== subTaskId);
      const payload: Partial<Order> = {
        subTasks: nextSubTasks,
        updatedAt: new Date()
      };
      if (autoCalculateHours) {
        const autoHours = calculateHoursFromSubTasks(nextSubTasks);
        payload.estimatedHours = autoHours.estimatedHours;
        payload.actualHours = autoHours.actualHours;
      }
      await updateOrder(payload, 'Unteraufgabe gelöscht');
    }
  };

  const handleUpdateComponentStatus = async (componentId: string, newStatus: string) => {
    const updatedComponents = localOrder.components?.map(c => {
      if ((c.id || (c as any)._id) === componentId) {
        return { ...c, status: newStatus as any };
      }
      return c;
    });
    
    // Optisch sofort updaten
    setLocalOrder(prev => ({ ...prev, components: updatedComponents }));
    
    // Direkt in DB speichern, genau wie bei Unteraufgaben
    await updateOrder({ components: updatedComponents }, 'Bauteil-Status aktualisiert');
  };

  const handleViewPDF = (doc: any) => {
    // We omit cache busters here because adblockers/privacy extensions in Firefox
    // sometimes block URLs containing tracking-like query parameters like 'cb='.
    if (doc.id) {
      const url = `/api/documents/${doc.id}?inline=true`;
      window.open(url, '_blank');
    } else if (localOrder.id && doc.name) {
      const url = `/api/orders/${localOrder.id}/files/${encodeURIComponent(doc.name)}?inline=true`;
      window.open(url, '_blank');
    } else if (doc.url) {
      window.open(doc.url, '_blank');
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

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-800 border-red-200';
      case 'medium': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'low': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getPriorityText = (priority: string) => {
    switch (priority) {
      case 'high': return 'Hoch';
      case 'medium': return 'Mittel';
      case 'low': return 'Niedrig';
      default: return priority;
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
                   ((state.currentUser?.role === 'employee' || state.currentUser?.role === 'manager') && localOrder.assignedTo === state.currentUser?.id);
  const canEditNotes = state.currentUser?.role === 'admin' || state.currentUser?.role === 'employee' || state.currentUser?.role === 'manager';

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
    
    return assignedUser;
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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
              onClick={() => setActiveTab('order_info')}
              className={`${
                activeTab === 'order_info'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}
            >
              Auftragsinformationen
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
            <button
              onClick={() => setActiveTab('subtasks')}
              className={`${
                activeTab === 'subtasks'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}
            >
              Unteraufgaben
            </button>
            <button
              onClick={() => setActiveTab('internal_files')}
              className={`${
                activeTab === 'internal_files'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}
            >
              Interne Dateien
            </button>
          </nav>
        </div>

        <div className="p-6">
          {/* Dashboard Tab */}
          <div className={activeTab === 'dashboard' ? 'block' : 'hidden'}>
            <div className="space-y-6">

              {/* Right Column (Arbeitsbereich) */}
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Arbeitsbereich</h3>
                
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
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

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Geschätzte Stunden
                      </label>
                      <input
                        type="number"
                        value={estimatedHours}
                        onChange={(e) => {
                          setAutoCalculateHours(false);
                          handleFieldChange('estimatedHours', e.target.value);
                        }}
                        disabled={(!canModify && state.currentUser?.role !== 'admin') || autoCalculateHours}
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
                        onChange={(e) => {
                          setAutoCalculateHours(false);
                          handleFieldChange('actualHours', e.target.value);
                        }}
                        disabled={(!canModify && state.currentUser?.role !== 'admin') || autoCalculateHours}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                        min="0"
                        step="0.5"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1 invisible">
                        Auto
                      </label>
                      <button
                        onClick={() => {
                          const newValue = !autoCalculateHours;
                          setAutoCalculateHours(newValue);
                          if (newValue && localOrder.subTasks) {
                            const autoSum = calculateHoursFromSubTasks(localOrder.subTasks);
                            handleFieldChange('estimatedHours', autoSum.estimatedHours.toString());
                            handleFieldChange('actualHours', autoSum.actualHours.toString());
                          }
                        }}
                        className="flex items-center justify-center h-[42px] text-sm font-medium text-gray-900 hover:text-gray-700 transition-colors w-full"
                        title="Stunden automatisch aus Unteraufgaben berechnen"
                      >
                        {autoCalculateHours ? <ToggleRight className="w-8 h-8 mr-2 text-blue-600" /> : <ToggleLeft className="w-8 h-8 mr-2 text-gray-400" />}
                        Auto-Berechnung
                      </button>
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
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Materialstatus
                    </label>
                    <div className="space-y-3">
                      <select
                        value={
                          localOrder.materialAvailable ? 'available' :
                          localOrder.materialOrderedByWorkshop ? 'workshop' :
                          localOrder.materialOrderedByClient ? 'client' :
                          'none'
                        }
                        onChange={(e) => {
                          const val = e.target.value;
                          handleFieldChange('materialAvailable', val === 'available');
                          handleFieldChange('materialOrderedByWorkshop', val === 'workshop');
                          handleFieldChange('materialOrderedByClient', val === 'client');
                        }}
                        disabled={!canModify && state.currentUser?.role !== 'admin'}
                        className="w-full p-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
                      >
                        <option value="available">Material vorhanden</option>
                        <option value="workshop">Material durch Werkstatt bestellt</option>
                        <option value="client">Material selbst bestellen</option>
                        <option value="none">Kein Material benötigt</option>
                      </select>
                      
                      {localOrder.materialOrderedByClient && localOrder.materialOrderedByClientConfirmed && (
                        <div className="mt-2">
                          <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">
                            ✓ Bestätigt vom Kunden
                          </span>
                        </div>
                      )}
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
                  <div className="flex flex-wrap gap-3">
                    {localOrder.status === 'pending' && (
                      <>
                        <button
                          onClick={() => handleStatusChange('accepted')}
                          className="flex-1 flex items-center justify-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors whitespace-nowrap"
                        >
                          <Check className="w-4 h-4 mr-2" />
                          Annehmen
                        </button>
                        <button
                          onClick={() => handleStatusChange('revision')}
                          className="flex-1 flex items-center justify-center px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors whitespace-nowrap"
                        >
                          <RotateCcw className="w-4 h-4 mr-2" />
                          Überarbeiten
                        </button>
                      </>
                    )}
                    
                    {localOrder.status === 'accepted' || localOrder.status === 'rework' ? (
                      <button
                        onClick={() => handleStatusChange('in_progress')}
                        className="flex-1 flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
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
                        className={`flex-1 flex items-center justify-center px-4 py-2 rounded-lg transition-colors whitespace-nowrap ${
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
                        className="flex-1 flex items-center justify-center px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors whitespace-nowrap"
                      >
                        <Archive className="w-4 h-4 mr-2" />
                        Archivieren
                      </button>
                    )}
                    
                    <button
                      onClick={() => handleStatusChange('revision')}
                      className="flex-1 flex items-center justify-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors whitespace-nowrap"
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      Ablehnen
                    </button>
                  </div>
                </div>
              )}
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
            </div>
          </div> {/* End Dashboard Tab */}



          {/* Order Info Tab */}
          <div className={activeTab === 'order_info' ? 'block' : 'hidden'}>
            <div className="space-y-6">
              {/* Auftragsinformationen */}
              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Auftragsinformationen</h3>
                <div className="flex flex-col gap-4">
                  {/* Obere Zeile */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">Auftraggeber:</span>
                      <span className="text-sm font-medium text-gray-900">{localOrder.clientName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">Deadline:</span>
                      <span className="text-sm font-medium text-gray-900">
                        {new Date(localOrder.deadline).toLocaleDateString('de-DE')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">Kostenstelle:</span>
                      <span className="text-sm font-medium text-gray-900">{localOrder.costCenter}</span>
                    </div>
                  </div>
                  {/* Untere Zeile */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">Status:</span>
                      <span className={`inline-flex px-3 py-1 text-xs rounded-full font-medium ${getStatusColor(localOrder.status)}`}>
                        {getStatusText(localOrder.status)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">Priorität:</span>
                      <span className={`inline-flex px-3 py-1 text-xs rounded-full border font-medium ${getPriorityColor(localOrder.priority)}`}>
                        {getPriorityText(localOrder.priority)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <hr className="border-t border-gray-200" />

              <div>
                <h4 className="text-md font-semibold text-gray-900 mb-2">Beschreibung</h4>
                <p className="text-gray-700 bg-gray-50 rounded-lg p-4 whitespace-pre-wrap">{localOrder.description}</p>
              </div>
              
              {/* Allgemeine Dateien Section */}
              {localOrder.documents && localOrder.documents.filter((doc: any) => !doc.componentId && !decodeURIComponent(doc.url || '').includes('00_Interne Dokumente')).length > 0 && (
                <>
                  <hr className="border-t border-gray-200" />
                  <div>
                    <h4 className="text-md font-semibold text-gray-900 mb-4">Allgemeine Dateien</h4>
                    <div className="flex flex-col gap-3">
                      {localOrder.documents.filter((doc: any) => !doc.componentId && !decodeURIComponent(doc.url || '').includes('00_Interne Dokumente')).map((doc: any) => (
                        <div key={doc.id} className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg shadow-sm">
                          <div className="flex items-center space-x-3 overflow-hidden">
                            <div className="flex-shrink-0">
                              {getFileIcon(doc.name)}
                            </div>
                            <div className="truncate">
                              <p className="text-sm font-medium text-gray-900 truncate" title={getDisplayPath(doc)}>
                                {doc.name}
                              </p>
                              <div className="text-xs text-gray-500">
                                {new Date(doc.uploadDate).toLocaleDateString('de-DE')}
                                {doc.pdfWarning && (
                                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                                    {doc.pdfWarning}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex-shrink-0 ml-4 flex space-x-2">
                            {isSTLFile(doc.name) && (
                              <button
                                onClick={() => toggleSTLViewer(doc.id)}
                                className="text-purple-600 hover:text-purple-800 transition-colors p-1"
                                title="3D Ansicht"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={() => handleDownload(doc)}
                              className="text-gray-500 hover:text-blue-600 transition-colors p-1"
                              title="Herunterladen"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Internal Files Tab */}
          <div className={activeTab === 'internal_files' ? 'block' : 'hidden'}>
            <div className="space-y-6">
              <div>
                <NetworkFilesViewer orderId={localOrder.id} refreshTrigger={internalFilesRefreshTrigger} />
              </div>

      {/* Dateiupload Bereich */}
      <div className="mt-6 border-t pt-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Dateiupload</h3>
        <NetworkDragDropUpload
          orderId={localOrder.id}
          uploadType="cam"
          targetFolder="Dateien"
          onUploadSuccess={(fileName) => {
            setInternalFilesRefreshTrigger(prev => prev + 1);
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
          </div>
          {/* Components Tab */}
          <div className={activeTab === 'components' ? 'block' : 'hidden'}>
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
                      <div key={componentId} id={`component-${componentId}`} className="border border-gray-200 rounded-lg p-4 bg-gray-50 transition-all duration-500">
                        <div className="mb-3">
                          <div className="flex justify-between items-start">
                            <h5 className="font-medium text-gray-900 text-sm">{componentTitle}</h5>
                            
                            {(canModify || state.currentUser?.role === 'admin') ? (
                              <select
                                value={component.status || 'pending'}
                                onChange={(e) => {
                                  handleUpdateComponentStatus(componentId, e.target.value);
                                }}
                                className={`text-xs px-2 py-1 rounded-full font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer ${getStatusColor(component.status || 'pending')}`}
                                style={{ border: 'none' }}
                              >
                                <option value="pending" className="bg-white text-gray-900">Ausstehend</option>
                                <option value="in_progress" className="bg-white text-gray-900">In Bearbeitung</option>
                                <option value="completed" className="bg-white text-gray-900">Abgeschlossen</option>
                              </select>
                            ) : (
                              <span className={`px-2 py-1 text-xs rounded-full font-medium ${getStatusColor(component.status || 'pending')}`}>
                                {getStatusText(component.status || 'pending')}
                              </span>
                            )}
                          </div>
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
                            <hr className="my-3 border-gray-200" />
                            <h6 className="text-xs font-medium text-gray-700 mb-2">Dokumente:</h6>
                            <div className="space-y-1">
                              {component.documents.map((doc) => (
                                <div key={doc.id} className="flex items-center justify-between p-2 bg-white rounded border text-sm">
                                  <div className="flex items-center">
                                    {getFileIcon(doc.name)}
                                    <div className="flex-1 min-w-0 ml-3">
                                      <div className="flex items-center">
                                        <span className="text-gray-900" title={getDisplayPath(doc)}>{doc.name}</span>
                                        {doc.pdfWarning && (
                                          <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                                            {doc.pdfWarning}
                                          </span>
                                        )}
                                      </div>
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
                                    {doc.name.toLowerCase().endsWith('.pdf') && (
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
                        <div className="mt-3">
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
                                componentId={componentId}
                                uploadType="component"
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
                        {/* Subtask Links Section */}
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          <h6 className="text-xs font-medium text-gray-700 mb-2">Unteraufgaben:</h6>
                          {(() => {
                            const linkedSubTasks = localOrder.subTasks?.filter(st => 
                              st.scopeType === 'component' && 
                              (st.assignedComponentIds?.includes(componentId) || st.assignedComponentId === componentId)
                            ) || [];

                            if (linkedSubTasks.length > 0) {
                              return (
                                <div className="space-y-2">
                                  {linkedSubTasks.map(st => (
                                    <div key={st.id} className="flex items-center justify-between text-sm bg-white p-2 border rounded shadow-sm">
                                      <span className="font-medium text-gray-800">{st.title}</span>
                                      <div className="flex space-x-3">
                                        <button onClick={() => { setActiveTab('subtasks'); setEditingSubTaskId(st.id); setEditSubTaskForm({ title: st.title, description: st.description || '', estimatedHours: st.estimatedHours?.toString() || '0', assignedTo: st.assignedTo || null, scopeType: 'component', assignedComponentIds: st.assignedComponentIds || (st.assignedComponentId ? [st.assignedComponentId] : []) }); }} className="text-blue-600 hover:text-blue-800 flex items-center" title="Bearbeiten"><Edit2 className="w-4 h-4 mr-1" /> Bearbeiten</button>
                                        <button onClick={() => { setActiveTab('subtasks'); }} className="text-purple-600 hover:text-purple-800 flex items-center" title="Zur Unteraufgabe springen"><Eye className="w-4 h-4 mr-1" /> Anzeigen</button>
                                        <button onClick={() => { handleUpdateSubTask(st, { assignedComponentIds: (st.assignedComponentIds || (st.assignedComponentId ? [st.assignedComponentId] : [])).filter(id => id !== componentId) }); }} className="text-red-600 hover:text-red-800 flex items-center" title="Verknüpfung aufheben"><X className="w-4 h-4 mr-1" /> Entfernen</button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              );
                            } else {
                                return (
                                  <div className="flex items-center space-x-3">
                                    <button onClick={() => { setActiveTab('subtasks'); setShowAddSubTask(true); setSubTaskScopeType('component'); setSubTaskAssignedComponentIds([componentId]); }} className="text-sm bg-blue-50 text-blue-600 hover:bg-blue-100 px-3 py-2 rounded text-left flex items-center border border-blue-200 font-medium transition-colors whitespace-nowrap"><Plus className="w-4 h-4 mr-2" /> Neue Unteraufgabe für Bauteil erstellen</button>
                                    <div className="flex-1 items-center flex">
                                      <select
                                        className="text-sm border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500 flex-1 py-1 px-2"
                                        value=""
                                        onChange={(e) => {
                                          const stId = e.target.value;
                                          if (!stId) return;
                                          const st = localOrder.subTasks?.find(t => t.id === stId);
                                          if (st) {
                                            handleUpdateSubTask(st, { scopeType: 'component', assignedComponentIds: [...(st.assignedComponentIds || (st.assignedComponentId ? [st.assignedComponentId] : [])), componentId] });
                                          }
                                        }}
                                      >
                                        <option value="">Mit bestehender Unteraufgabe verknüpfen...</option>
                                        {localOrder.subTasks?.filter(st => !st.assignedComponentIds?.includes(componentId) && st.assignedComponentId !== componentId).map(st => (
                                          <option key={st.id} value={st.id}>{st.title}</option>
                                        ))}
                                      </select>
                                    </div>
                                  </div>
                                );
                              }
                          })()}
                        </div>
                      </div>
                      );
                    })}
                  </div>
                </div>
              )}
          </div>


          {/* Subtasks Tab */}
          <div className={activeTab === 'subtasks' ? 'block' : 'hidden'}>
          {/* Sub-tasks Section */}
          <div className="mt-8 border-t pt-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Unteraufgaben</h3>
              {(state.currentUser?.role === 'admin' || state.currentUser?.role === 'employee' || state.currentUser?.role === 'manager') && (
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
                    <div className="md:col-span-2 border border-gray-300 rounded-lg p-3 bg-white max-h-48 overflow-y-auto">
                      <label className="block text-sm font-medium text-gray-700 mb-2">Bauteile auswählen:</label>
                      <div className="space-y-2">
                        {localOrder.components?.map(comp => {
                          const compId = comp.id || (comp as any)._id;
                          const compTitle = comp.title || (comp as any).name || 'Unbenanntes Bauteil';
                          const isSelected = subTaskAssignedComponentIds.includes(compId);
                          return (
                            <label key={compId} className="flex items-center space-x-2 cursor-pointer p-1 hover:bg-gray-50 rounded">
                              <input 
                                type="checkbox" 
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                checked={isSelected}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSubTaskAssignedComponentIds([...subTaskAssignedComponentIds, compId]);
                                  } else {
                                    setSubTaskAssignedComponentIds(subTaskAssignedComponentIds.filter(id => id !== compId));
                                  }
                                }}
                              />
                              <span className="text-sm text-gray-800">{compTitle}</span>
                            </label>
                          );
                        })}
                      </div>
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
                            <div className="flex items-center">
                              <span className="text-sm text-gray-900" title={getDisplayPath(doc)}>{doc.name}</span>
                              {doc.pdfWarning && (
                                <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                                  {doc.pdfWarning}
                                </span>
                              )}
                            </div>
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
                        {editingSubTaskId === subTask.id ? (
                          <div className="space-y-2 pr-4">
                            <input
                              type="text"
                              value={editSubTaskForm.title}
                              onChange={e => setEditSubTaskForm({ ...editSubTaskForm, title: e.target.value })}
                              className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                              placeholder="Titel"
                            />
                            <textarea
                              value={editSubTaskForm.description}
                              onChange={e => setEditSubTaskForm({ ...editSubTaskForm, description: e.target.value })}
                              className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                              placeholder="Beschreibung"
                              rows={2}
                            />
                            <div className="flex flex-wrap gap-2 pt-1">
                              {/* Zuweisung */}
                              <select
                                value={editSubTaskForm.assignedTo || ''}
                                onChange={(e) => setEditSubTaskForm({...editSubTaskForm, assignedTo: e.target.value || null})}
                                className="text-sm px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                              >
                                <option value="">Mitarbeiter auswählen</option>
                                {state.workshopAccounts.filter(acc => acc.role === 'workshop' || acc.role === 'admin').map((account) => (
                                  <option key={account.id} value={account.id}>{account.name}</option>
                                ))}
                              </select>

                              {/* Scope */}
                              <select
                                value={editSubTaskForm.scopeType}
                                onChange={(e) => setEditSubTaskForm({...editSubTaskForm, scopeType: e.target.value as 'order' | 'component', assignedComponentIds: e.target.value === 'order' ? [] : editSubTaskForm.assignedComponentIds})}
                                className="text-sm px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                              >
                                <option value="order">Gesamtauftrag</option>
                                <option value="component">Bauteil</option>
                              </select>

                              {/* Component (if scope == component) */}
                              {editSubTaskForm.scopeType === 'component' && (
                                <div className="w-full mt-2 border border-gray-300 rounded p-2 bg-white max-h-32 overflow-y-auto">
                                  <div className="text-xs text-gray-500 mb-1">Bauteile:</div>
                                  <div className="space-y-1">
                                    {localOrder.components?.map((comp) => {
                                      const compId = comp.id || (comp as any)._id;
                                      const compTitle = comp.title || (comp as any).name || 'Unbenanntes Bauteil';
                                      const isSelected = editSubTaskForm.assignedComponentIds.includes(compId);
                                      return (
                                        <label key={compId} className="flex items-center space-x-2 text-sm cursor-pointer hover:bg-gray-50 p-1 rounded">
                                          <input 
                                            type="checkbox" 
                                            checked={isSelected}
                                            onChange={(e) => {
                                              if (e.target.checked) {
                                                setEditSubTaskForm({...editSubTaskForm, assignedComponentIds: [...editSubTaskForm.assignedComponentIds, compId]});
                                              } else {
                                                setEditSubTaskForm({...editSubTaskForm, assignedComponentIds: editSubTaskForm.assignedComponentIds.filter(id => id !== compId)});
                                              }
                                            }}
                                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                          />
                                          <span className="text-gray-800">{compTitle}</span>
                                        </label>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                            <div className="flex items-center space-x-2 pt-1">
                              <label className="text-sm text-gray-600">Geschätzte Stunden:</label>
                              <input
                                type="number"
                                value={editSubTaskForm.estimatedHours}
                                onChange={e => setEditSubTaskForm({ ...editSubTaskForm, estimatedHours: e.target.value })}
                                className="w-24 px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                                min="0"
                                step="0.5"
                              />
                            </div>
                            <div className="flex space-x-2 pt-2">
                              <button
                                onClick={() => {
                                  handleUpdateSubTask(subTask, {
                                    title: editSubTaskForm.title,
                                    description: editSubTaskForm.description,
                                    estimatedHours: parseFloat(editSubTaskForm.estimatedHours) || 0,
                                    assignedTo: editSubTaskForm.assignedTo,
                                    scopeType: editSubTaskForm.scopeType,
                                    assignedComponentIds: editSubTaskForm.assignedComponentIds,
                                    assignedComponentTitles: editSubTaskForm.scopeType === 'order' ? [] : editSubTaskForm.assignedComponentIds.map(id => getComponentDisplayById(id) || 'Bauteil')
                                  });
                                  setEditingSubTaskId(null);
                                }}
                                className="flex items-center px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
                              >
                                <Save className="w-3 h-3 mr-1" /> Speichern
                              </button>
                              <button
                                onClick={() => setEditingSubTaskId(null)}
                                className="px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-sm"
                              >
                                Abbrechen
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <h4 className="font-medium text-gray-900">{subTask.title}</h4>
                            <p className="text-sm text-gray-600 mt-1">{subTask.description}</p>
                          </>
                        )}
                      </div>
                      {editingSubTaskId !== subTask.id && (
                        <div className="flex items-center space-x-3">
                          {canModify || state.currentUser?.role === 'admin' || subTask.assignedTo === state.currentUser?.id ? (
                            <select
                              value={subTask.status}
                              onChange={(e) => handleUpdateSubTask(subTask, { status: e.target.value as SubTask['status'] })}
                              className={`text-xs px-2 py-1 rounded-full font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer ${getStatusColor(subTask.status)}`}
                              style={{ border: 'none' }}
                            >
                              <option value="pending" className="bg-white text-gray-900">Ausstehend</option>
                              <option value="in_progress" className="bg-white text-gray-900">In Bearbeitung</option>
                              <option value="completed" className="bg-white text-gray-900">Abgeschlossen</option>
                            </select>
                          ) : (
                            <span className={`px-2 py-1 text-xs rounded-full font-medium ${getStatusColor(subTask.status)}`}>
                              {getStatusText(subTask.status)}
                            </span>
                          )}
                          {(state.currentUser?.role === 'admin' || state.currentUser?.role === 'employee' || state.currentUser?.role === 'manager') && (
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={() => {
                                  setEditingSubTaskId(subTask.id);
                                  setEditSubTaskForm({
                                    title: subTask.title,
                                    description: subTask.description || '',
                                    estimatedHours: subTask.estimatedHours?.toString() || '0',
                                    assignedTo: subTask.assignedTo || null,
                                    scopeType: subTask.scopeType || 'order',
                                    assignedComponentIds: subTask.assignedComponentIds || (subTask.assignedComponentId ? [subTask.assignedComponentId] : [])
                                  });
                                }}
                                className="text-blue-600 hover:text-blue-800"
                                title="Bearbeiten"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteSubTask(subTask.id)}
                                className="text-red-600 hover:text-red-800"
                                title="Löschen"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </div>
                      )}
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
                                <div className="flex items-center">
                                  <span className="text-sm text-gray-900" title={getDisplayPath(doc)}>{doc.name}</span>
                                  {doc.pdfWarning && (
                                    <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                                      {doc.pdfWarning}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center space-x-2">
                                {doc.name.toLowerCase().endsWith('.pdf') && (
                                  <button
                                    onClick={() => handleViewPDF(doc)}
                                    className="text-red-600 hover:text-red-800 transition-colors flex items-center"
                                  >
                                    <Eye className="w-3 h-3 mr-1" />
                                    <span className="text-xs">Anzeigen</span>
                                  </button>
                                )}
                                <button
                                  onClick={() => handleDownload(doc)}
                                  className="text-blue-600 hover:text-blue-800 transition-colors flex items-center"
                                >
                                  <Download className="w-3 h-3 mr-1" />
                                  <span className="text-xs">Download</span>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    <div className="grid grid-cols-3 gap-4 text-sm mb-3">
                      <div>
                        <span className="text-gray-600">Geschätzt: </span>
                        <span className="font-medium">
                          {editingSubTaskId === subTask.id ? editSubTaskForm.estimatedHours : subTask.estimatedHours}h
                        </span>
                      </div>
                      <div className="flex items-center">
                        <span className="text-gray-600 mr-2">Tatsächlich: </span>
                        <input
                          type="number"
                          value={subTask.actualHours}
                          onChange={(e) => handleUpdateSubTask(subTask, { actualHours: parseFloat(e.target.value) || 0 })}
                          disabled={!canModify && state.currentUser?.role !== 'admin' && subTask.assignedTo !== state.currentUser?.id}
                          className="w-16 text-xs px-2 py-1 border border-gray-300 rounded disabled:bg-gray-100"
                          min="0"
                          step="0.5"
                        />
                        <span className="text-gray-600 ml-1">h</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Zugewiesen: </span>
                        <span className="font-medium">
                          {getAssignmentDisplay(subTask)}
                        </span>
                      </div>
                    </div>

                    {subTask.scopeType === 'component' && (
                      <div className="mt-3">
                        <div className="space-y-2">
                          {(subTask.assignedComponentIds && subTask.assignedComponentIds.length > 0) ? (
                            subTask.assignedComponentIds.map(compId => {
                              const comp = localOrder.components?.find(c => (c.id || (c as any)._id) === compId);
                              if (!comp) return null;
                              return (
                                <div key={compId} className="flex items-center justify-between p-2 bg-white rounded border border-gray-200 shadow-sm">
                                  <div className="flex items-center">
                                    <Wrench className="w-4 h-4 text-gray-500 mr-2" />
                                    <span className="text-sm font-medium text-gray-800">{comp.title || (comp as any).name || 'Unbenanntes Bauteil'}</span>
                                  </div>
                                  <button
                                    onClick={() => {
                                      setActiveTab('components');
                                      setTimeout(() => {
                                        const el = document.getElementById(`component-${compId}`);
                                        if (el) {
                                          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                          el.classList.add('ring-2', 'ring-blue-500', 'ring-offset-2');
                                          setTimeout(() => el.classList.remove('ring-2', 'ring-blue-500', 'ring-offset-2'), 2000);
                                        }
                                      }, 100);
                                    }}
                                    className="flex items-center text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition-colors font-medium"
                                  >
                                    <ArrowRight className="w-3 h-3 mr-1" /> Zum Bauteil
                                  </button>
                                </div>
                              );
                            })
                          ) : subTask.assignedComponentId ? (
                            (() => {
                              const comp = localOrder.components?.find(c => (c.id || (c as any)._id) === subTask.assignedComponentId);
                              if (!comp) return null;
                              return (
                                <div className="flex items-center justify-between p-2 bg-white rounded border border-gray-200 shadow-sm">
                                  <div className="flex items-center">
                                    <Wrench className="w-4 h-4 text-gray-500 mr-2" />
                                    <span className="text-sm font-medium text-gray-800">{comp.title || (comp as any).name || 'Unbenanntes Bauteil'}</span>
                                  </div>
                                  <button
                                    onClick={() => {
                                      setActiveTab('components');
                                      setTimeout(() => {
                                        const el = document.getElementById(`component-${subTask.assignedComponentId}`);
                                        if (el) {
                                          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                          el.classList.add('ring-2', 'ring-blue-500', 'ring-offset-2');
                                          setTimeout(() => el.classList.remove('ring-2', 'ring-blue-500', 'ring-offset-2'), 2000);
                                        }
                                      }, 100);
                                    }}
                                    className="flex items-center text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition-colors font-medium"
                                  >
                                    <ArrowRight className="w-3 h-3 mr-1" /> Zum Bauteil
                                  </button>
                                </div>
                              );
                            })()
                          ) : null}
                        </div>
                      </div>
                    )}

                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8">Keine Unteraufgaben vorhanden</p>
            )}
          </div>
        </div>
          </div>

        {/* Löschen-Button für Admin unten zentriert */}
        {activeTab === 'dashboard' && state.currentUser?.role === 'admin' && (
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

    </div>
  );
}