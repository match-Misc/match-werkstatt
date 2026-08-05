import React, { useState } from 'react';
import { X, Upload, FileText, Trash2, Save, Box, Plus } from 'lucide-react';
import { getFileIcon, getFileIconSmall } from '../utils/fileIcons';
import { useApp } from '../context/AppContext';
import { Order, PDFDocument, RevisionComment, Component } from '../types';
import { checkPdfSize } from '../utils/pdfChecker';
import CostCenterPicker from './CostCenterPicker';

interface EditOrderProps {
  order: Order;
  onClose: () => void;
  onOrderUpdated?: () => void; // Callback für Order-Update
}

export default function EditOrder({ order, onClose, onOrderUpdated }: EditOrderProps) {
  const { dispatch } = useApp();
  const [title, setTitle] = useState(order.title);
  const [description, setDescription] = useState(order.description);
  const [deadline, setDeadline] = useState(new Date(order.deadline).toISOString().split('T')[0]);
  const [costCenter, setCostCenter] = useState(order.costCenter);
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>(order.priority);
  const [documents, setDocuments] = useState<PDFDocument[]>(order.documents);
  const [dragActive, setDragActive] = useState(false);
  const [components, setComponents] = useState<Component[]>(
    (order.components || []).map((component) => ({
      ...component,
      quantity: component.quantity && component.quantity > 0 ? component.quantity : 1
    }))
  );
  const [activeComponentDragId, setActiveComponentDragId] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      // Erst neue Dateien hochladen
      const processedDocuments = await Promise.all(
        documents.map(async (doc) => {
          if (doc.file) {
            // Neue Datei - erst hochladen
            const formData = new FormData();
            formData.append('file', doc.file);
            
            const uploadResponse = await fetch('/api/upload', {
              method: 'POST',
              body: formData
            });
            
            if (!uploadResponse.ok) {
              throw new Error(`Upload fehlgeschlagen für ${doc.name}`);
            }
            
            const uploadData = await uploadResponse.json();
            
            return {
              id: doc.id,
              name: uploadData.originalname,
              url: `/uploads/${uploadData.filename}`,
              uploadDate: doc.uploadDate
            };
          } else {
            // Bestehende Datei - keine Änderung
            return {
              id: doc.id,
              name: doc.name,
              url: doc.url,
              uploadDate: doc.uploadDate
            };
          }
        })
      );
      
      // Bauteil-Dokumente verarbeiten (neue Dateien hochladen)
      const processedComponents = await Promise.all(
        components.map(async (comp) => {
          const processedCompDocs = await Promise.all(
            (comp.documents || []).map(async (doc) => {
              if (doc.file) {
                // Neue Datei - erst hochladen
                const formData = new FormData();
                formData.append('file', doc.file);
                
                const uploadResponse = await fetch('/api/upload', {
                  method: 'POST',
                  body: formData
                });
                
                if (!uploadResponse.ok) {
                  throw new Error(`Upload fehlgeschlagen für ${doc.name}`);
                }
                
                const uploadData = await uploadResponse.json();
                
                return {
                  id: doc.id,
                  name: uploadData.originalname,
                  url: `/uploads/${uploadData.filename}`,
                  uploadDate: doc.uploadDate
                };
              } else {
                // Bestehende Datei - keine Änderung
                return {
                  id: doc.id,
                  name: doc.name,
                  url: doc.url,
                  uploadDate: doc.uploadDate
                };
              }
            })
          );
          
          return {
            ...comp,
            documents: processedCompDocs
          };
        })
      );

      const updatedOrder: Order = {
        ...order,
        title,
        description,
        deadline: new Date(deadline),
        costCenter,
        priority,
        documents: processedDocuments,
        components: processedComponents,
        status: 'pending', // Reset to pending when resubmitted
        canEdit: false,
        updatedAt: new Date()
      };

      console.log('=== FRONTEND: EditOrder Submit ===');
      console.log('Order ID:', order.id);
      console.log('processedDocuments:', processedDocuments);
      console.log('updatedOrder:', updatedOrder);
      console.log('JSON to be sent:', JSON.stringify(updatedOrder));

      // Auftrag in der Datenbank aktualisieren
      console.log('=== FRONTEND: Sending PUT Request ===');
      const response = await fetch(`/api/orders/${order.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatedOrder)
      });

      console.log('=== FRONTEND: PUT Response ===');
      console.log('Response status:', response.status);
      console.log('Response ok:', response.ok);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('PUT Request failed:', errorText);
        throw new Error(`Fehler beim Speichern des Auftrags: ${response.status} ${errorText}`);
      }

      const responseData = await response.json();
      console.log('PUT Response data:', responseData);

      // Lokalen State aktualisieren
      dispatch({ type: 'UPDATE_ORDER', payload: updatedOrder });
      dispatch({ 
        type: 'SHOW_NOTIFICATION', 
        payload: { message: 'Auftrag wurde erfolgreich überarbeitet und erneut eingereicht', type: 'success' }
      });
      
      // Parent-Komponente über Update informieren
      if (onOrderUpdated) {
        onOrderUpdated();
      }
      
      onClose();
    } catch (error) {
      console.error('Fehler beim Aktualisieren des Auftrags:', error);
      dispatch({ 
        type: 'SHOW_NOTIFICATION', 
        payload: { message: 'Fehler beim Speichern des Auftrags', type: 'error' }
      });
    }
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files) return;

    for (const file of Array.from(files)) {
      const sizeWarning = await checkPdfSize(file);
      if (sizeWarning) {
        const confirmed = window.confirm(`Achtung: Die Datei "${file.name}" hat ein Überformat (${sizeWarning}). Formate größer als A3 werden nicht empfohlen.\n\nMöchten Sie diese Datei trotzdem hochladen?`);
        if (!confirmed) {
          continue;
        }
      }

      // Alle Dateitypen akzeptieren (nicht nur PDF)
      const document: PDFDocument = {
        id: `doc_${Date.now()}_${Math.random()}`,
        name: file.name,
        url: URL.createObjectURL(file),
        uploadDate: new Date(),
        file: file,
        pdfWarning: sizeWarning ? `Format: ${sizeWarning}` : undefined
      };
      setDocuments(prev => [...prev, document]);
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
    handleFileUpload(e.dataTransfer.files);
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

  // Bauteil-Beschreibung aktualisieren
  const updateComponentDescription = (componentId: string, newDescription: string) => {
    setComponents(prev => prev.map(comp => 
      comp.id === componentId ? { ...comp, description: newDescription } : comp
    ));
  };

  const updateComponentQuantity = (componentId: string, newQuantity: string) => {
    setComponents(prev => prev.map(comp =>
      comp.id === componentId
        ? { ...comp, quantity: Math.max(1, Number(newQuantity) || 1) }
        : comp
    ));
  };

  // Datei zu Bauteil hinzufügen
  const handleComponentFileUpload = async (componentId: string, files: FileList | null) => {
    if (!files) return;

    const newDocs: PDFDocument[] = [];
    for (const file of Array.from(files)) {
      const sizeWarning = await checkPdfSize(file);
      if (sizeWarning) {
        const confirmed = window.confirm(`Achtung: Die Datei "${file.name}" hat ein Überformat (${sizeWarning}). Formate größer als A3 werden nicht empfohlen.\n\nMöchten Sie diese Datei trotzdem hochladen?`);
        if (!confirmed) {
          continue;
        }
      }
      newDocs.push({
        id: `comp_doc_${Date.now()}_${Math.random()}`,
        name: file.name,
        url: URL.createObjectURL(file),
        uploadDate: new Date(),
        file: file,
        pdfWarning: sizeWarning ? `Format: ${sizeWarning}` : undefined
      });
    }

    setComponents(prev => prev.map(comp => 
      comp.id === componentId 
        ? { ...comp, documents: [...(comp.documents || []), ...newDocs] }
        : comp
    ));
  };

  // Dokument von Bauteil entfernen
  const removeComponentDocument = (componentId: string, docId: string) => {
    setComponents(prev => prev.map(comp => {
      if (comp.id === componentId) {
        const docToRemove = comp.documents?.find(doc => doc.id === docId);
        if (docToRemove?.url && docToRemove.url.startsWith('blob:')) {
          URL.revokeObjectURL(docToRemove.url);
        }
        return {
          ...comp,
          documents: comp.documents?.filter(doc => doc.id !== docId) || []
        };
      }
      return comp;
    }));
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="flex justify-between items-center p-6 border-b">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Auftrag überarbeiten</h2>
            <p className="text-orange-600 text-sm mt-1">
              Dieser Auftrag wurde zur Überarbeitung zurückgeschickt
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
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
              <CostCenterPicker
                id="costCenter"
                value={costCenter}
                onChange={setCostCenter}
                required={true}
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
          </div>

          {/* Revision History */}
          {order.revisionHistory && Array.isArray(order.revisionHistory) && order.revisionHistory.length > 0 && (
            <div className="md:col-span-2">
              <h3 className="text-lg font-semibold text-gray-800 mb-3 border-t pt-6">Kommentare zur Überarbeitung</h3>
              <div className="space-y-4 bg-orange-50 rounded-lg p-4 border border-orange-200 max-h-60 overflow-y-auto">
                {order.revisionHistory.map((entry: RevisionComment, index: number) => (
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
            <label className="block text-sm font-medium text-gray-700 mb-2">
              PDF Dokumente
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
                  onChange={(e) => handleFileUpload(e.target.files)}
                  className="hidden"
                />
              </label>
            </div>

            {documents.length > 0 && (
              <div className="mt-4 space-y-2">
                {documents.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center">
                      {getFileIcon(doc.name || '')}
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

          {/* Bauteile-Bereich (editierbar) */}
          {components && components.length > 0 && (
            <div className="md:col-span-2">
              <h3 className="text-lg font-semibold text-gray-800 mb-3 border-t pt-6 flex items-center">
                <Box className="w-5 h-5 mr-2 text-blue-600" />
                Bauteile ({components.length})
              </h3>
              <div className="space-y-4">
                {components.map((component, index) => (
                  <div key={component.id || index} className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-semibold text-gray-800">{component.title}</h4>
                        <span className="inline-block mt-1 px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded">
                          Stückzahl: {component.quantity || 1}
                        </span>
                      </div>
                    </div>
                    
                    {/* Editierbare Beschreibung */}
                    <div className="mt-3">
                      <label className="block text-xs font-medium text-gray-500 mb-1">
                        Anzahl
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={component.quantity}
                        onChange={(e) => updateComponentQuantity(component.id, e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white mb-2"
                      />

                      <label className="block text-xs font-medium text-gray-500 mb-1">
                        Beschreibung
                      </label>
                      <textarea
                        value={component.description || ''}
                        onChange={(e) => updateComponentDescription(component.id, e.target.value)}
                        placeholder="Beschreibung des Bauteils..."
                        rows={2}
                        className="w-full px-3 py-2 text-sm border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                      />
                    </div>
                    
                    {/* Komponenten-Dokumente */}
                    <div className="mt-3 pt-3 border-t border-blue-200">
                      <p className="text-xs font-medium text-gray-500 mb-2">Dokumente:</p>
                      
                      {/* Bestehende Dokumente */}
                      {component.documents && component.documents.length > 0 && (
                        <div className="space-y-1 mb-3">
                          {component.documents.map((doc, docIndex) => (
                            <div key={doc.id || docIndex} className="flex items-center justify-between p-2 bg-white rounded border">
                              <div className="flex items-center flex-1 min-w-0">
                                {getFileIconSmall(doc.name || '')}
                                <span className="text-sm text-gray-700 truncate">{doc.name}</span>
                                {doc.pdfWarning && (
                                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                                    {doc.pdfWarning}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center space-x-2 ml-2">
                                {!doc.file && (
                                  <a
                                    href={`${doc.url}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                                  >
                                    Öffnen
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
                      
                      {/* Datei-Upload für Bauteil */}
                      <div
                        className={`border-2 border-dashed rounded-lg p-3 transition-colors ${
                          activeComponentDragId === component.id
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-blue-200 bg-white'
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
                        <p className="text-xs text-gray-600 mb-2">Dateien hier ablegen oder</p>
                        <label className="cursor-pointer inline-flex items-center px-3 py-2 text-sm bg-white border border-blue-300 rounded-lg hover:bg-blue-50 transition-colors">
                          <Plus className="w-4 h-4 mr-2 text-blue-600" />
                          <span className="text-blue-600">Datei hinzufügen</span>
                          <input
                            type="file"
                            multiple
                            accept=".pdf,.stl,.step,.stp,.ipt,.iges,.igs,.obj,.ply,.3ds,.dae,.gltf,.glb"
                            onChange={(e) => handleComponentFileUpload(component.id, e.target.files)}
                            className="hidden"
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end space-x-3 pt-6 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center"
            >
              <Save className="w-4 h-4 mr-2" />
              Überarbeitung einreichen
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}