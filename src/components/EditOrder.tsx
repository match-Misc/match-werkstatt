import React, { useState } from 'react';
import { X, Upload, FileText, Trash2, Save } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Order, PDFDocument, RevisionComment } from '../types';

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
            
            const uploadResponse = await fetch('http://localhost:3001/api/upload', {
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
      
      const updatedOrder: Order = {
        ...order,
        title,
        description,
        deadline: new Date(deadline),
        costCenter,
        priority,
        documents: processedDocuments,
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
      const response = await fetch(`http://localhost:3001/api/orders/${order.id}`, {
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

  const handleFileUpload = (files: FileList | null) => {
    if (!files) return;

    Array.from(files).forEach(file => {
      // Alle Dateitypen akzeptieren (nicht nur PDF)
      const document: PDFDocument = {
        id: `doc_${Date.now()}_${Math.random()}`,
        name: file.name,
        url: URL.createObjectURL(file),
        uploadDate: new Date(),
        file: file
      };
      setDocuments(prev => [...prev, document]);
    });
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

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
                      <FileText className="w-5 h-5 text-red-600 mr-3" />
                      <span className="text-sm text-gray-900">{doc.name}</span>
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