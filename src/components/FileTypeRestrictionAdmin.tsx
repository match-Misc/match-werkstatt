import React, { useState, useEffect } from 'react';
import { X, Plus } from 'lucide-react';
import { useApp } from '../context/AppContext';

export default function FileTypeRestrictionAdmin() {
  const { dispatch } = useApp();
  const [extensions, setExtensions] = useState<string[]>([]);
  const [newExtension, setNewExtension] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchRestrictions();
  }, []);

  const fetchRestrictions = async () => {
    try {
      const response = await fetch('/api/admin/file-restrictions');
      const data = await response.json();
      if (data.success) {
        setExtensions(data.restrictedExtensions || []);
      }
    } catch (err) {
      console.error('Failed to fetch file restrictions:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const saveRestrictions = async (newExtensions: string[]) => {
    try {
      const response = await fetch('/api/admin/file-restrictions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restrictedExtensions: newExtensions })
      });
      const data = await response.json();
      if (data.success) {
        dispatch({ type: 'SHOW_NOTIFICATION', payload: { message: 'Dateityp-Filterung gespeichert', type: 'success' } });
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      console.error('Failed to save file restrictions:', err);
      dispatch({ type: 'SHOW_NOTIFICATION', payload: { message: 'Fehler beim Speichern der Einstellungen', type: 'error' } });
    }
  };

  const handleAdd = () => {
    const trimmed = newExtension.trim().toLowerCase();
    if (!trimmed) return;
    
    // Auto-prepend dot if missing
    const ext = trimmed.startsWith('.') ? trimmed : `.${trimmed}`;
    
    if (!extensions.includes(ext)) {
      const updated = [...extensions, ext];
      setExtensions(updated);
      saveRestrictions(updated);
    }
    setNewExtension('');
  };

  const handleRemove = (extToRemove: string) => {
    const updated = extensions.filter(e => e !== extToRemove);
    setExtensions(updated);
    saveRestrictions(updated);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  if (isLoading) {
    return <div className="text-sm text-gray-500">Lade Dateityp-Filterung...</div>;
  }

  return (
    <div className="w-full mb-6">
      <p className="text-sm text-gray-600 mb-4">Dateien mit diesen Endungen werden für Auftraggeber und Gäste komplett ausgeblendet.</p>

      <div className="flex gap-2 mb-4">
        <div className="flex-grow">
          <input
            type="text"
            value={newExtension}
            onChange={(e) => setNewExtension(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="z.B. .zip oder .xlsx"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
          />
        </div>
        <button
          onClick={handleAdd}
          className="bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 transition-colors flex items-center"
        >
          <Plus className="w-4 h-4 mr-1" />
          Hinzufügen
        </button>
      </div>

      {extensions.length === 0 ? (
        <p className="text-sm text-gray-400 italic">Derzeit sind keine Dateitypen blockiert.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {extensions.map((ext) => (
            <span
              key={ext}
              className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-orange-100 text-orange-800 border border-orange-200"
            >
              {ext}
              <button
                onClick={() => handleRemove(ext)}
                className="ml-2 inline-flex items-center justify-center w-4 h-4 rounded-full hover:bg-orange-200 focus:outline-none"
              >
                <X className="w-3 h-3 text-orange-600" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
