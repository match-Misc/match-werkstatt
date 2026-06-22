import React, { useState, useEffect, useRef } from 'react';
import { X, Upload, FileText, Trash2, Plus } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Order, PDFDocument, Component, Material } from '../types';
import { checkPdfSize } from '../utils/pdfChecker';

interface CreateOrderProps {
  onClose: () => void;
}

export default function CreateOrder({ onClose }: CreateOrderProps) {
  const { state } = useApp();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState('');
  const [costCenter, setCostCenter] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [documents, setDocuments] = useState<PDFDocument[]>([]);
  const [components, setComponents] = useState<Component[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [activeComponentDragId, setActiveComponentDragId] = useState<string | null>(null);
  const [orderType, setOrderType] = useState<'fertigung' | 'service'>('fertigung');
  const [availableMaterials, setAvailableMaterials] = useState<Material[]>([]);
  const draftIdRef = useRef(`draft_${Date.now()}_${Math.random().toString(36).substring(7)}`);

  useEffect(() => {
    return () => {
      // Cleanup draft folder on unmount
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
  }, []);

  const uploadSingleFile = async (file: File): Promise<PDFDocument | null> => {
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const newOrder = {
      title,
      description,
      clientId: state.currentUser!.id,
      clientName: state.currentUser!.name,
      deadline: new Date(deadline),
      costCenter,
      priority,
      status: 'pending',
      documents,
      components, // Neue Bauteile hinzufügen
      estimatedHours: 0,
      actualHours: 0,
      assignedTo: null,
      notes: '',
      createdAt: new Date(),
      updatedAt: new Date(),
      subTasks: [],
      orderType,
      // Initialisiere die neuen Felder als leere Arrays
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
      onClose();
    } catch (err) {
      console.error('Network error:', err);
      alert('Netzwerkfehler beim Anlegen des Auftrags!');
    }
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

  // Hilfsfunktion für FileList (Drag & Drop)
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
      if (docToRemove?.url) {
        URL.revokeObjectURL(docToRemove.url);
      }
      return prev.filter(doc => doc.id !== id);
    });
  };

  // Funktionen für Bauteile-Management
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
      // Cleanup URLs für Dokumente
      compToRemove?.documents.forEach(doc => {
        if (doc.url) {
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
          ? { ...comp, documents: [...comp.documents, ...uploadedDocs] }
          : comp
      ));
    } catch (err) {
      alert('Netzwerkfehler beim Hochladen!');
    }
  };

  const removeComponentDocument = (componentId: string, docId: string) => {
    setComponents(prev => prev.map(comp => 
      comp.id === componentId 
        ? { ...comp, documents: comp.documents.filter(doc => doc.id !== docId) }
        : comp
    ));
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-xl font-bold text-gray-900">Neuen Auftrag erstellen</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
                Auftragstitel *
              </label>
              <input
                type="text"
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>

            <div className="md:col-span-2">
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
                Beschreibung *
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
                Deadline *
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
                Kostenstelle *
              </label>
              <input
                type="text"
                id="costCenter"
                value={costCenter}
                onChange={(e) => setCostCenter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="z.B. KOSTEN-001"
                required
              />
            </div>

            <div>
              <label htmlFor="priority" className="block text-sm font-medium text-gray-700 mb-2">
                Priorität
              </label>
              <select
                id="priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as 'low' | 'medium' | 'high')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="low">Niedrig</option>
                <option value="medium">Mittel</option>
                <option value="high">Hoch</option>
              </select>
            </div>

            <div>
              <label htmlFor="orderType" className="block text-sm font-medium text-gray-700 mb-2">
                Auftragstyp *
              </label>
              <select
                id="orderType"
                value={orderType}
                onChange={e => setOrderType(e.target.value as 'fertigung' | 'service')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              >
                <option value="fertigung">Fertigungsauftrag</option>
                <option value="service">Serviceauftrag</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
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
                  <div key={doc.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center">
                      <FileText className="w-5 h-5 text-red-600 mr-3" />
                      <span className="text-sm text-gray-900">{doc.name}</span>
                      {doc.pdfWarning && (
                        <span className="ml-3 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                          {doc.pdfWarning}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeDocument(doc.id)}
                      className="text-red-600 hover:text-red-800 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bauteile-Sektion */}
          <div className="md:col-span-2">
            <div className="flex justify-between items-center mb-4">
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
                  <div key={component.id} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
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
                      
                      {component.documents.length > 0 && (
                        <div className="space-y-1">
                          {component.documents.map((doc) => (
                            <div key={doc.id} className="flex items-center justify-between p-2 bg-white rounded border">
                              <div className="flex items-center">
                                <FileText className="w-4 h-4 text-red-600 mr-2" />
                                <span className="text-sm text-gray-900">{doc.name}</span>
                                {doc.pdfWarning && (
                                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                                    {doc.pdfWarning}
                                  </span>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => removeComponentDocument(component.id, doc.id)}
                                className="text-red-600 hover:text-red-800 transition-colors"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
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
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              style={{ minWidth: 120 }}
            >
              Abbrechen
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-lg text-white font-semibold text-base transition-colors bg-blue-600 hover:bg-blue-700"
              style={{ minWidth: 180 }}
            >
              Auftrag einreichen
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}