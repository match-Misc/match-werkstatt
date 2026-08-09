import React, { useState, useEffect, useRef } from 'react';
import { X, Upload, Trash2, Plus, Eye } from 'lucide-react';
import { getFileIcon, getFileIconSmall, isImageFile, isPDFFile } from '../utils/fileIcons';
import { useApp } from '../context/AppContext';
import { useNavigate } from 'react-router-dom';
import { Order, PDFDocument, Component, Material, User } from '../types';
import { useTranslation } from 'react-i18next';
import { checkPdfSize } from '../utils/pdfChecker';
import CostCenterPicker from './CostCenterPicker';

interface OrderFormProps {
  mode: 'create' | 'edit';
  initialData?: Order;
  onClose?: () => void;
}

export default function OrderForm({ mode, initialData, onClose }: OrderFormProps) {
  const { state, dispatch } = useApp();
  const navigate = useNavigate();
  const { t } = useTranslation();
  
  // Initialization based on mode
  const [title, setTitle] = useState(mode === 'edit' && initialData ? initialData.title : '');
  const [projectName, setProjectName] = useState(mode === 'edit' && initialData?.projectName ? initialData.projectName : '');
  const [description, setDescription] = useState(mode === 'edit' && initialData ? initialData.description : '');
  const [orderClientId, setOrderClientId] = useState(mode === 'edit' && initialData ? initialData.clientId : state.currentUser!.id);
  const [orderClientName, setOrderClientName] = useState(mode === 'edit' && initialData ? initialData.clientName : state.currentUser!.name);
  const [users, setUsers] = useState<User[]>([]);
  
  const formatDateForInput = (dateString?: Date | string) => {
    if (!dateString) return '';
    try {
      const d = new Date(dateString);
      return d.toISOString().split('T')[0];
    } catch {
      return '';
    }
  };
  
  const [deadline, setDeadline] = useState(mode === 'edit' && initialData ? formatDateForInput(initialData.deadline) : '');
  const [costCenter, setCostCenter] = useState(mode === 'edit' && initialData ? initialData.costCenter : '');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>(mode === 'edit' && initialData ? initialData.priority : 'medium');
  const [orderType, setOrderType] = useState<'fertigung' | 'service'>(mode === 'edit' && initialData ? initialData.orderType || 'fertigung' : 'fertigung');
  const [documents, setDocuments] = useState<PDFDocument[]>(mode === 'edit' && initialData ? initialData.documents || [] : []);
  
  // Prepare components from initialData, ensuring quantity defaults properly
  const initialComponents = mode === 'edit' && initialData?.components 
    ? initialData.components.map(c => ({...c, quantity: c.quantity || 1})) 
    : [];
  const [components, setComponents] = useState<Component[]>(initialComponents);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [titleImageUrl, setTitleImageUrl] = useState('');
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [activeComponentDragId, setActiveComponentDragId] = useState<string | null>(null);
  const [availableMaterials, setAvailableMaterials] = useState<Material[]>([]);
  const draftIdRef = useRef(`draft_${Date.now()}_${Math.random().toString(36).substring(7)}`);

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showComponentWarning, setShowComponentWarning] = useState(false);

  // Determine user role and edit permissions
  const currentUserRole = state.currentUser?.role || 'guest';
  const isClient = currentUserRole === 'client';
  
  // In edit mode, clients can't change certain fields like priority and orderType
  const canEditAdvancedFields = !(mode === 'edit' && isClient);

  useEffect(() => {
    return () => {
      // Cleanup draft folder on unmount (only relevant if not saved)
      fetch(`/api/upload/tmp/${draftIdRef.current}`, { method: 'DELETE' }).catch(console.error);
    };
  }, []);

  useEffect(() => {
    const fetchMaterials = async () => {
      try {
        const res = await fetch('/api/materials');
        if (res.ok) {
          const data = await res.json();
          setAvailableMaterials(data);
        }
      } catch (err) {
        console.error('Fehler beim Laden der Materialien:', err);
      }
    };
    fetchMaterials();

    if (currentUserRole === 'admin' || currentUserRole === 'manager') {
      fetch(`/api/users?viewerRole=${encodeURIComponent(currentUserRole)}`)
        .then(res => res.json())
        .then(data => setUsers(data.filter((u: User) => u.isActive !== false)))
        .catch(err => console.error('Fehler beim Laden der Benutzer:', err));
    }
  }, []);

  const uploadSingleFile = async (file: File): Promise<PDFDocument | null> => {
    // Ignore images inside PDF if this is a PDF component being handled specially
    if (file.type.startsWith('image/')) {
      const isInsidePdfFolder = file.webkitRelativePath && file.webkitRelativePath.toLowerCase().includes('.pdf');
      if (isInsidePdfFolder) {
        return null;
      }
    }

    const sizeWarning = await checkPdfSize(file);
    if (sizeWarning) {
      const confirmed = window.confirm(`Achtung: Die Datei "${file.name}" hat ein Überformat (${sizeWarning}). Formate größer als A3 werden nicht empfohlen.\n\nMöchten Sie diese Datei trotzdem hochladen?`);
      if (!confirmed) {
        return null;
      }
    }

    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`/api/upload?draftId=${draftIdRef.current}`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error('Fehler beim Hochladen');
    }

    const data = await response.json();
    return {
      id: `doc_${Date.now()}_${Math.random()}`,
      name: data.originalname,
      url: data.path || `/uploads/${data.filename}`,
      uploadDate: new Date(),
      file: undefined,
      pdfWarning: sizeWarning ? `Format: ${sizeWarning}` : undefined
    };
  };

  const handleViewImage = (doc: PDFDocument) => {
    if (doc.url) setPreviewImageUrl(doc.url);
  };

  const handleCreateSubmit = async (isDraft: boolean = false) => {
    const newOrder = {
      title,
      projectName,
      description,
      clientId: orderClientId,
      clientName: orderClientName,
      deadline: deadline ? new Date(deadline) : null,
      costCenter,
      priority,
      status: isDraft ? 'Entwurf' : 'pending',
      documents,
      components,
      estimatedHours: 0,
      actualHours: 0,
      assignedTo: null,
      notes: '',
      createdAt: new Date(),
      updatedAt: new Date(),
      subTasks: [],
      orderType,
      revisionHistory: [],
      reworkComments: [],
      noteHistory: [],
    };

    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newOrder)
      });
      if (!response.ok) {
        const errorData = await response.json();
        console.error('Backend error:', errorData);
        alert(`Fehler beim Anlegen des Auftrags: ${errorData.error || 'Unbekannter Fehler'}`);
        return;
      }
      
      dispatch({ type: 'SHOW_NOTIFICATION', payload: { message: isDraft ? 'Entwurf erfolgreich gespeichert' : 'Auftrag erfolgreich erstellt', type: 'success' } });
      
      if (onClose) onClose();
      else navigate(-1);
    } catch (err) {
      console.error('Network error:', err);
      alert('Netzwerkfehler beim Anlegen des Auftrags!');
    }
  };

  const handleEditSubmit = async (isDraft: boolean = false) => {
    if (!initialData) return;

    // First upload any newly added files (those with .file property in an edit scenario)
    // Wait, in this refactored component, uploadSingleFile uploads immediately on drop. 
    // So all documents/components.documents already have valid URLs. 
    // We don't need to re-upload them like in the old EditOrder.tsx because uploadSingleFile already handled it to tmp.

    const updatedOrder = {
      ...initialData,
      title,
      projectName,
      description,
      clientId: orderClientId,
      clientName: orderClientName,
      deadline: deadline ? new Date(deadline) : null,
      costCenter,
      priority,
      orderType,
      status: isDraft ? 'Entwurf' : 'pending',
      documents,
      components,
      updatedAt: new Date(),
      isManualEdit: true // Flag for backend to trigger email notification
    };

    try {
      const response = await fetch(`/api/orders/${initialData.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatedOrder)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Fehler beim Speichern des Auftrags: ${response.status} ${errorText}`);
      }

      const responseData = await response.json();
      
      dispatch({ type: 'UPDATE_ORDER', payload: responseData });
      dispatch({ 
        type: 'SHOW_NOTIFICATION', 
        payload: { message: isDraft ? 'Entwurf erfolgreich gespeichert' : 'Änderungen wurden erfolgreich gespeichert und Beteiligte benachrichtigt', type: 'success' }
      });
      
      if (onClose) onClose();
      else navigate(`/orders/${initialData.id}`);
    } catch (error) {
      console.error('Fehler beim Aktualisieren des Auftrags:', error);
      dispatch({ 
        type: 'SHOW_NOTIFICATION', 
        payload: { message: 'Fehler beim Speichern des Auftrags', type: 'error' }
      });
    } finally {
      setShowConfirmModal(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const isSubmittingDraft = mode === 'edit' && initialData?.status === 'Entwurf';
    if (mode === 'create' || isSubmittingDraft) {
      if (orderType === 'fertigung' && components.length === 0) {
        setShowComponentWarning(true);
      } else {
        if (mode === 'create') handleCreateSubmit(false);
        else handleEditSubmit(false);
      }
    } else {
      setShowConfirmModal(true);
    }
  };

  const handleDraftSubmit = () => {
    if (mode === 'create') {
      handleCreateSubmit(true);
    } else {
      handleEditSubmit(true);
    }
  };

  const handleClose = () => {
    if (onClose) onClose();
    else navigate(-1);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    try {
      const uploadedDocs = (await Promise.all(Array.from(files).map(uploadSingleFile))).filter(Boolean) as PDFDocument[];
      setDocuments(prev => [...prev, ...uploadedDocs]);
    } catch (err) {
      alert('Netzwerkfehler beim Hochladen!');
    }
  };

  const handleFileListUpload = async (fileList: FileList) => {
    if (!fileList.length) return;
    try {
      const uploadedDocs = (await Promise.all(Array.from(fileList).map(uploadSingleFile))).filter(Boolean) as PDFDocument[];
      setDocuments(prev => [...prev, ...uploadedDocs]);
    } catch (err) {
      alert('Netzwerkfehler beim Hochladen!');
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileListUpload(e.dataTransfer.files);
    }
  };

  const removeDocument = (id: string) => {
    setDocuments(prev => {
      const docToRemove = prev.find(doc => doc.id === id);
      if (docToRemove?.url && docToRemove.url.startsWith('blob:')) {
        URL.revokeObjectURL(docToRemove.url);
      }
      return prev.filter(doc => doc.id !== id);
    });
  };

  const addComponent = () => {
    const newComponent: Component = {
      id: `comp_${Date.now()}_${Math.random()}`,
      title: '',
      description: '',
      quantity: 1,
      documents: []
    };
    setComponents(prev => [...prev, newComponent]);
  };

  const updateComponent = (id: string, field: keyof Component, value: any) => {
    setComponents(prev => prev.map(comp => 
      comp.id === id
        ? {
            ...comp,
            [field]: field === 'quantity' ? Math.max(1, Number(value) || 1) : value
          }
        : comp
    ));
  };

  const removeComponent = (id: string) => {
    setComponents(prev => {
      const compToRemove = prev.find(comp => comp.id === id);
      compToRemove?.documents.forEach(doc => {
        if (doc.url && doc.url.startsWith('blob:')) {
          URL.revokeObjectURL(doc.url);
        }
      });
      return prev.filter(comp => comp.id !== id);
    });
  };

  const handleComponentFileUpload = async (componentId: string, files: FileList | null) => {
    if (!files || !files.length) return;
    try {
      const uploadedDocs = (await Promise.all(Array.from(files).map(uploadSingleFile))).filter(Boolean) as PDFDocument[];
      setComponents(prev => prev.map(comp => 
        comp.id === componentId 
          ? { ...comp, documents: [...(comp.documents || []), ...uploadedDocs] }
          : comp
      ));
    } catch (err) {
      alert('Netzwerkfehler beim Hochladen!');
    }
  };

  const removeComponentDocument = (componentId: string, docId: string) => {
    setComponents(prev => prev.map(comp => 
      comp.id === componentId 
        ? { ...comp, documents: (comp.documents || []).filter(doc => doc.id !== docId) }
        : comp
    ));
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Änderungen speichern?</h3>
            <p className="text-gray-600 mb-6">
              Bist du sicher, dass du alle Änderungen vorgenommen hast? Bei 'Ja' werden die Änderungen übernommen und alle beteiligten Personen per E-Mail benachrichtigt.
            </p>
            <div className="flex justify-end space-x-4">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Nein, Abbrechen
              </button>
              <button
                type="button"
                onClick={() => handleEditSubmit(false)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Ja, Änderungen speichern
              </button>
            </div>
          </div>
        </div>
      )}

      {showComponentWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Fehlendes Bauteil</h3>
            <p className="text-gray-600 mb-6">
              Es wurde kein Bauteil definiert. Für einen Fertigungsauftrag sollte mindestens ein Bauteil erstellt werden.
            </p>
            <div className="flex justify-end space-x-4">
              <button
                type="button"
                onClick={() => setShowComponentWarning(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Auftrag weiterbearbeiten
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowComponentWarning(false);
                  if (mode === 'create') handleCreateSubmit(false);
                  else handleEditSubmit(false);
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Auftrag trotzdem einreichen
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-xl font-bold text-gray-900">
            {mode === 'create' ? t('orderForm.createNew', 'Neuen Auftrag erstellen') : t('orderForm.editOrder', 'Auftrag bearbeiten')}
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('orderForm.projectName', 'Projektname')}
              </label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                placeholder="Name des Projekts"
              />
            </div>
            
            <div className="md:col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('orderForm.orderTitle', 'Auftragstitel')} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                placeholder="Kurze, aussagekräftige Bezeichnung"
              />
            </div>
            
            {(currentUserRole === 'admin' || currentUserRole === 'manager') && (
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('orderForm.client', 'Auftraggeber')}
                </label>
                <select
                  value={orderClientId}
                  onChange={(e) => {
                    setOrderClientId(e.target.value);
                    const user = users.find(u => u.id === e.target.value);
                    if (user) setOrderClientName(user.name);
                  }}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                >
                  <option value={state.currentUser!.id}>{state.currentUser!.name} ({t('orderForm.me', 'Ich')})</option>
                  {users.filter(u => u.id !== state.currentUser!.id).map(user => (
                    <option key={user.id} value={user.id}>
                      {user.name} ({user.company || t('orderForm.noInstitute', 'Kein Institut')})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="md:col-span-2">
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
                {t('orderForm.description', 'Beschreibung')} *
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>

            <div>
              <label htmlFor="deadline" className="block text-sm font-medium text-gray-700 mb-2">
                {t('orderForm.deadline', 'Deadline')} *
              </label>
              <input
                type="date"
                id="deadline"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>

            <div>
              <label htmlFor="costCenter" className="block text-sm font-medium text-gray-700 mb-2">
                {t('orderForm.costCenter', 'Kostenstelle')} *
              </label>
              <CostCenterPicker
                id="costCenter"
                value={costCenter}
                onChange={setCostCenter}
                required={true}
              />
            </div>

            {canEditAdvancedFields && (
              <>
                <div>
                  <label htmlFor="priority" className="block text-sm font-medium text-gray-700 mb-2">
                    {t('orderForm.priority', 'Priorität')}
                  </label>
                  <select
                    id="priority"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as 'low' | 'medium' | 'high')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="low">{t('priority.low', 'Niedrig')}</option>
                    <option value="medium">{t('priority.medium', 'Mittel')}</option>
                    <option value="high">{t('priority.high', 'Hoch')}</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="orderType" className="block text-sm font-medium text-gray-700 mb-2">
                    {t('orderForm.orderType', 'Auftragstyp')} *
                  </label>
                  <select
                    id="orderType"
                    value={orderType}
                    onChange={e => setOrderType(e.target.value as 'fertigung' | 'service')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  >
                    <option value="fertigung">{t('orderForm.manufacturingOrder', 'Fertigungsauftrag')}</option>
                    <option value="service">{t('orderForm.serviceOrder', 'Serviceauftrag')}</option>
                  </select>
                </div>
              </>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 mt-4">
              Allgemeine PDF-Dokumente
            </label>
            <div
              className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                dragActive
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 mb-2">PDF-Dateien hier ablegen oder</p>
              <label className="cursor-pointer">
                <span className="text-blue-600 hover:text-blue-800">Dateien auswählen</span>
                <input
                  type="file"
                  multiple
                  accept=".pdf,.stl,.step,.stp,.ipt,.iges,.igs,.obj,.ply,.3ds,.dae,.gltf,.glb"
                  onChange={(e) => handleFileUpload(e)}
                  className="hidden"
                />
              </label>
            </div>

            {documents.length > 0 && (
              <div className="mt-4 space-y-2">
                {documents.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                    <div className="flex items-center">
                      {getFileIcon(doc.name || '')}
                      <span className="text-sm text-gray-900">{doc.name}</span>
                      {doc.pdfWarning && (
                        <span className="ml-3 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                          {doc.pdfWarning}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center space-x-2">
                      {isImageFile(doc.name || '') && (
                        <button
                          type="button"
                          onClick={() => handleViewImage(doc)}
                          className="text-green-600 hover:text-green-800 hover:bg-green-50 transition-colors p-1.5 rounded"
                          title="Bild anzeigen"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      )}
                      {isPDFFile(doc.name || '') && doc.url && (
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-red-600 hover:text-red-800 hover:bg-red-50 transition-colors p-1.5 rounded"
                          title="PDF anzeigen"
                        >
                          <Eye className="w-4 h-4" />
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => removeDocument(doc.id)}
                        className="text-red-600 hover:text-red-800 transition-colors"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bauteile-Sektion */}
          <div className="md:col-span-2">
            <div className="flex justify-between items-center mb-4 mt-6 pt-4 border-t">
              <label className="block text-sm font-medium text-gray-700">
                Bauteile (optional)
              </label>
              <button
                type="button"
                onClick={addComponent}
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-blue-700 bg-blue-100 hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <Plus className="w-4 h-4 mr-1" />
                Bauteil hinzufügen
              </button>
            </div>
            
            {components.length === 0 ? (
              <div className="text-center py-6 border-2 border-dashed border-gray-300 rounded-lg">
                <p className="text-gray-500 text-sm">Keine Bauteile hinzugefügt</p>
                <p className="text-gray-400 text-xs mt-1">Klicken Sie auf "Bauteil hinzufügen", um Bauteile mit eigenen Beschreibungen und Dokumenten zu erstellen</p>
              </div>
            ) : (
              <div className="space-y-4">
                {components.map((component, index) => (
                  <div key={component.id} className="border border-gray-200 rounded-lg p-4 bg-gray-50 shadow-sm">
                    <div className="flex justify-between items-start mb-3">
                      <h4 className="text-md font-medium text-gray-900">Bauteil {index + 1}</h4>
                      <button
                        type="button"
                        onClick={() => removeComponent(component.id)}
                        className="text-red-600 hover:text-red-800 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Titel *
                        </label>
                        <input
                          type="text"
                          value={component.title}
                          onChange={(e) => updateComponent(component.id, 'title', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="z.B. Gehäuse, Schraube, etc."
                          required={components.length > 0}
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Anzahl *
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={component.quantity}
                          onChange={(e) => updateComponent(component.id, 'quantity', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Material
                        </label>
                        <select
                          value={component.material || ''}
                          onChange={(e) => updateComponent(component.id, 'material', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                          <option value="">Kein Material ausgewählt</option>
                          {availableMaterials.map(mat => (
                            <option key={mat.id} value={mat.name}>{mat.name}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Beschreibung
                        </label>
                        <textarea
                          value={component.description}
                          onChange={(e) => updateComponent(component.id, 'description', e.target.value)}
                          rows={2}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="Detaillierte Beschreibung des Bauteils..."
                        />
                      </div>
                    </div>
                    
                    {/* Dokumente für Bauteil */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Dokumente für dieses Bauteil
                      </label>
                      <div
                        className={`border-2 border-dashed rounded-lg p-4 mb-2 transition-colors ${
                          activeComponentDragId === component.id
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-300 hover:border-gray-400 bg-white'
                        }`}
                        onDragEnter={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setActiveComponentDragId(component.id);
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setActiveComponentDragId(component.id);
                        }}
                        onDragLeave={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (activeComponentDragId === component.id) {
                            setActiveComponentDragId(null);
                          }
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setActiveComponentDragId(null);
                          handleComponentFileUpload(component.id, e.dataTransfer.files);
                        }}
                      >
                        <p className="text-gray-600 text-sm mb-2">Dateien hier ablegen oder</p>
                        <label className="cursor-pointer inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50">
                          <Upload className="w-4 h-4 mr-2" />
                          Dateien hochladen
                          <input
                            type="file"
                            multiple
                            accept=".pdf,.stl,.step,.stp,.ipt,.iges,.igs,.obj,.ply,.3ds,.dae,.gltf,.glb"
                            onChange={(e) => handleComponentFileUpload(component.id, e.target.files)}
                            className="hidden"
                          />
                        </label>
                      </div>
                      
                      {component.documents && component.documents.length > 0 && (
                        <div className="space-y-1 mt-2">
                          {component.documents.map((doc) => (
                            <div key={doc.id} className="flex items-center justify-between p-2 bg-white rounded border">
                              <div className="flex items-center">
                                {getFileIconSmall(doc.name || '')}
                                <span className="text-sm text-gray-900">{doc.name}</span>
                                {doc.pdfWarning && (
                                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                                    {doc.pdfWarning}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center space-x-2">
                                {isImageFile(doc.name || '') && (
                                  <button
                                    type="button"
                                    onClick={() => handleViewImage(doc)}
                                    className="text-green-600 hover:text-green-800 hover:bg-green-50 transition-colors p-1.5 rounded"
                                    title="Bild anzeigen"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </button>
                                )}
                                {isPDFFile(doc.name || '') && doc.url && (
                                  <a
                                    href={doc.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-red-600 hover:text-red-800 hover:bg-red-50 transition-colors p-1.5 rounded"
                                    title="PDF anzeigen"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </a>
                                )}
                                <button
                                  type="button"
                                  onClick={() => removeComponentDocument(component.id, doc.id)}
                                  className="text-red-600 hover:text-red-800 transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-between pt-6 border-t mt-6">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              style={{ minWidth: 120 }}
            >
              Abbrechen
            </button>
            <div className="flex gap-4">
              {(!initialData || initialData.status === 'Entwurf') && (
                <button
                  type="button"
                  onClick={handleDraftSubmit}
                  className="px-5 py-2 border border-blue-600 rounded-lg text-blue-600 font-semibold text-base transition-colors hover:bg-blue-50"
                  style={{ minWidth: 180 }}
                >
                  {mode === 'create' ? 'Als Entwurf speichern' : 'Änderungen als Entwurf speichern'}
                </button>
              )}
              <button
                type="submit"
                className="px-5 py-2 rounded-lg text-white font-semibold text-base transition-colors bg-blue-600 hover:bg-blue-700"
                style={{ minWidth: 180 }}
              >
                {mode === 'create' ? 'Auftrag einreichen' : (initialData?.status === 'Entwurf' ? 'Auftrag offiziell einreichen' : 'Änderungen speichern')}
              </button>
            </div>
          </div>
      </form>
      </div>

      {/* Image Preview Overlay */}
      {previewImageUrl && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-75 p-4"
          onClick={() => setPreviewImageUrl(null)}
        >
          <div className="relative max-w-full max-h-full">
            <button 
              className="absolute -top-12 right-0 text-white hover:text-gray-300"
              onClick={() => setPreviewImageUrl(null)}
              title="Schließen"
            >
              <X className="w-8 h-8" />
            </button>
            <img 
              src={previewImageUrl} 
              alt="Vorschau" 
              className="max-w-full max-h-[90vh] object-contain rounded shadow-2xl bg-white"
              onClick={(e) => e.stopPropagation()} 
            />
          </div>
        </div>
      )}
    </div>
  );
}
