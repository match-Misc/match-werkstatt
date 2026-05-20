import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, Check, X, Box } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Material } from '../types';

export default function MaterialManagement() {
  const { dispatch } = useApp();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newMaterialName, setNewMaterialName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const fetchMaterials = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/materials');
      if (res.ok) {
        const data = await res.json();
        setMaterials(data);
      }
    } catch (err) {
      console.error('Failed to fetch materials', err);
      dispatch({ type: 'SHOW_NOTIFICATION', payload: { message: 'Fehler beim Laden der Materialien', type: 'error' } });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMaterials();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAddMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMaterialName.trim()) return;

    try {
      const res = await fetch('/api/materials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newMaterialName.trim() })
      });

      if (res.ok) {
        setNewMaterialName('');
        fetchMaterials();
        dispatch({ type: 'SHOW_NOTIFICATION', payload: { message: 'Material hinzugefügt', type: 'success' } });
      } else {
        const data = await res.json();
        dispatch({ type: 'SHOW_NOTIFICATION', payload: { message: data.error || 'Fehler beim Hinzufügen', type: 'error' } });
      }
    } catch (err) {
      dispatch({ type: 'SHOW_NOTIFICATION', payload: { message: 'Netzwerkfehler', type: 'error' } });
    }
  };

  const handleDeleteMaterial = async (id: string) => {
    if (!window.confirm('Möchten Sie dieses Material wirklich löschen?')) return;

    try {
      const res = await fetch(`/api/materials/${id}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        setMaterials(prev => prev.filter(m => m.id !== id));
        dispatch({ type: 'SHOW_NOTIFICATION', payload: { message: 'Material gelöscht', type: 'success' } });
      } else {
        dispatch({ type: 'SHOW_NOTIFICATION', payload: { message: 'Fehler beim Löschen', type: 'error' } });
      }
    } catch (err) {
      dispatch({ type: 'SHOW_NOTIFICATION', payload: { message: 'Netzwerkfehler', type: 'error' } });
    }
  };

  const startEditing = (material: Material) => {
    setEditingId(material.id);
    setEditingName(material.name);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditingName('');
  };

  const saveEdit = async () => {
    if (!editingId || !editingName.trim()) return;

    try {
      const res = await fetch(`/api/materials/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingName.trim() })
      });

      if (res.ok) {
        setMaterials(prev => prev.map(m => m.id === editingId ? { ...m, name: editingName.trim() } : m));
        setEditingId(null);
        dispatch({ type: 'SHOW_NOTIFICATION', payload: { message: 'Material aktualisiert', type: 'success' } });
      } else {
        const data = await res.json();
        dispatch({ type: 'SHOW_NOTIFICATION', payload: { message: data.error || 'Fehler beim Aktualisieren', type: 'error' } });
      }
    } catch (err) {
      dispatch({ type: 'SHOW_NOTIFICATION', payload: { message: 'Netzwerkfehler', type: 'error' } });
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center">
        <Box className="w-5 h-5 text-gray-500 mr-2" />
        <h3 className="text-md font-semibold text-gray-900">Materialverwaltung</h3>
      </div>
      
      <div className="p-4">
        <p className="text-sm text-gray-600 mb-4">
          Hier können Sie die Materialien definieren, die bei der Bauteil-Erstellung im Dropdown zur Verfügung stehen.
        </p>

        <form onSubmit={handleAddMaterial} className="flex gap-2 mb-6">
          <input
            type="text"
            value={newMaterialName}
            onChange={(e) => setNewMaterialName(e.target.value)}
            placeholder="Neues Material hinzufügen (z.B. S235JR)"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          />
          <button
            type="submit"
            disabled={!newMaterialName.trim()}
            className="inline-flex items-center px-4 py-2 bg-blue-600 border border-transparent rounded-md font-medium text-white text-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4 mr-1" />
            Hinzufügen
          </button>
        </form>

        {isLoading ? (
          <div className="text-center py-4 text-sm text-gray-500">Lade Materialien...</div>
        ) : materials.length === 0 ? (
          <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-lg">
            <p className="text-gray-500 text-sm">Noch keine Materialien angelegt.</p>
          </div>
        ) : (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <ul className="divide-y divide-gray-200">
              {materials.map((material) => (
                <li key={material.id} className="flex items-center justify-between p-3 hover:bg-gray-50">
                  {editingId === material.id ? (
                    <div className="flex-1 flex items-center gap-2">
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        className="flex-1 px-2 py-1 border border-blue-300 rounded text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEdit();
                          if (e.key === 'Escape') cancelEditing();
                        }}
                      />
                      <button onClick={saveEdit} className="p-1 text-green-600 hover:text-green-800" title="Speichern">
                        <Check className="w-4 h-4" />
                      </button>
                      <button onClick={cancelEditing} className="p-1 text-gray-400 hover:text-gray-600" title="Abbrechen">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="text-sm font-medium text-gray-900">{material.name}</span>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => startEditing(material)}
                          className="p-1 text-blue-600 hover:text-blue-800 transition-colors"
                          title="Bearbeiten"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteMaterial(material.id)}
                          className="p-1 text-red-600 hover:text-red-800 transition-colors"
                          title="Löschen"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
