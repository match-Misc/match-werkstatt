import React, { useState, useEffect } from 'react';
import { Plus, X, ShieldAlert } from 'lucide-react';

interface CostCenter {
  id: string;
  number: string;
  projectName: string;
}

interface CostCenterPickerProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}

export default function CostCenterPicker({ id, value, onChange, required = false }: CostCenterPickerProps) {
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [newNumber, setNewNumber] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [creating, setCreating] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const fetchCostCenters = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/cost-centers');
      if (!res.ok) throw new Error('Fehler beim Laden');
      const data = await res.json();
      setCostCenters(data);
    } catch (err: any) {
      setError('Kostenstellen konnten nicht geladen werden');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCostCenters();
  }, []);

  const handleCreate = async (e?: React.SyntheticEvent) => {
    e?.preventDefault();
    if (!newNumber || !newProjectName) {
      setModalError('Bitte alle Felder ausfüllen');
      return;
    }

    try {
      setCreating(true);
      setModalError(null);
      
      const res = await fetch('/api/cost-centers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: newNumber, projectName: newProjectName }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Fehler beim Erstellen');
      }

      const created = await res.json();
      setCostCenters([...costCenters, created]);
      onChange(created.number); // Select the newly created cost center
      setShowModal(false);
      setNewNumber('');
      setNewProjectName('');
    } catch (err: any) {
      setModalError(err.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="relative">
      <div className="flex gap-2">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          disabled={loading}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:opacity-75"
        >
          <option value="">Bitte wählen...</option>
          {costCenters.map(cc => (
            <option key={cc.id} value={cc.number}>
              {cc.number} ({cc.projectName})
            </option>
          ))}
          {/* Allow maintaining the existing value even if it's not in the list (backward compatibility) */}
          {value && !costCenters.find(cc => cc.number === value) && (
            <option value={value}>{value} (Unbekannt)</option>
          )}
        </select>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300 rounded-lg px-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
          title="Neue Kostenstelle anlegen"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}

      {showModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true" onClick={() => setShowModal(false)}></div>
            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg leading-6 font-medium text-gray-900" id="modal-title">
                    Neue Kostenstelle anlegen
                  </h3>
                  <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-500 focus:outline-none">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                
                {modalError && (
                  <div className="mb-4 bg-red-50 border-l-4 border-red-400 p-3 shadow-sm rounded-r-md flex items-center">
                    <ShieldAlert className="h-5 w-5 text-red-400 mr-2" />
                    <p className="text-sm text-red-700">{modalError}</p>
                  </div>
                )}

                <div>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nummer *</label>
                    <input
                      type="text"
                      required
                      placeholder="z.B. KOSTEN-001"
                      value={newNumber}
                      onChange={(e) => setNewNumber(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Projektname *</label>
                    <input
                      type="text"
                      required
                      placeholder="z.B. Projekt X"
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div className="flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setShowModal(false)}
                      className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none"
                    >
                      Abbrechen
                    </button>
                    <button
                      type="button"
                      onClick={handleCreate}
                      disabled={creating}
                      className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none disabled:opacity-50"
                    >
                      {creating ? 'Wird angelegt...' : 'Anlegen & Auswählen'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
