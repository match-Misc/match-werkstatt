import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Edit2, Check, X, ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface CostCenter {
  id: string;
  number: string;
  projectName: string;
  createdAt: string;
}

export default function CostCenterManagement() {
  const { t } = useTranslation();
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Forms
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newNumber, setNewNumber] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [creating, setCreating] = useState(false);

  // Edit State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNumber, setEditNumber] = useState('');
  const [editProjectName, setEditProjectName] = useState('');

  const fetchCostCenters = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/cost-centers');
      if (!res.ok) throw new Error('Fehler beim Laden der Kostenstellen');
      const data = await res.json();
      setCostCenters(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCostCenters();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNumber || !newProjectName) {
      setError('Bitte alle Felder ausfüllen');
      return;
    }

    try {
      setCreating(true);
      setError(null);
      setSuccess(null);
      
      const res = await fetch('/api/cost-centers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: newNumber, projectName: newProjectName }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Fehler beim Erstellen');
      }

      setSuccess('Kostenstelle erfolgreich erstellt');
      setShowCreateForm(false);
      setNewNumber('');
      setNewProjectName('');
      fetchCostCenters();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleEdit = (cc: CostCenter) => {
    setEditingId(cc.id);
    setEditNumber(cc.number);
    setEditProjectName(cc.projectName);
  };

  const handleSaveEdit = async () => {
    if (!editNumber || !editProjectName) {
      setError('Bitte alle Felder ausfüllen');
      return;
    }

    try {
      setError(null);
      setSuccess(null);
      
      const res = await fetch(`/api/cost-centers/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: editNumber, projectName: editProjectName }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Fehler beim Speichern');
      }

      setSuccess('Kostenstelle aktualisiert');
      setEditingId(null);
      fetchCostCenters();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Möchten Sie diese Kostenstelle wirklich löschen?')) return;

    try {
      setError(null);
      setSuccess(null);
      
      const res = await fetch(`/api/cost-centers/${id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Fehler beim Löschen');
      }

      setSuccess('Kostenstelle gelöscht');
      fetchCostCenters();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h4 className="text-md font-semibold text-gray-900">
          {t('admin.costCenters', 'Kostenstellen verwalten')}
        </h4>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-md text-sm font-medium flex items-center shadow-sm"
        >
          <Plus className="w-4 h-4 mr-1" />
          {t('admin.newCostCenter', 'Neue Kostenstelle')}
        </button>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border-l-4 border-red-400 p-4 shadow-sm rounded-r-md">
          <div className="flex">
            <ShieldAlert className="h-5 w-5 text-red-400 mr-3" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      )}

      {success && (
        <div className="mb-4 bg-green-50 border-l-4 border-green-400 p-4 shadow-sm rounded-r-md">
          <div className="flex">
            <Check className="h-5 w-5 text-green-400 mr-3" />
            <p className="text-sm text-green-700">{success}</p>
          </div>
        </div>
      )}

      {showCreateForm && (
        <div className="mb-6 bg-gray-50 border border-gray-200 rounded-lg p-5">
          <h5 className="text-sm font-medium text-gray-900 mb-3">Neue Kostenstelle anlegen</h5>
          <form onSubmit={handleCreate} className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">Nummer</label>
              <input
                type="text"
                required
                placeholder="z.B. 123456"
                value={newNumber}
                onChange={(e) => setNewNumber(e.target.value)}
                className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm border py-2 px-3"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">Projektname</label>
              <input
                type="text"
                required
                placeholder="z.B. Forschungsprojekt Alpha"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm border py-2 px-3"
              />
            </div>
            <div className="flex items-end gap-2 mt-2 sm:mt-0">
              <button
                type="submit"
                disabled={creating}
                className="bg-blue-600 text-white py-2 px-4 rounded-md shadow-sm text-sm font-medium hover:bg-blue-700 focus:outline-none disabled:opacity-50 h-[38px]"
              >
                {creating ? 'Speichert...' : 'Speichern'}
              </button>
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="bg-white border border-gray-300 text-gray-700 py-2 px-4 rounded-md shadow-sm text-sm font-medium hover:bg-gray-50 h-[38px]"
              >
                Abbrechen
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center p-6">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nummer</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Projektname</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Aktionen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {costCenters.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-6 py-4 text-center text-sm text-gray-500">
                    Keine Kostenstellen vorhanden.
                  </td>
                </tr>
              ) : (
                costCenters.map((cc) => (
                  <tr key={cc.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {editingId === cc.id ? (
                        <input
                          type="text"
                          value={editNumber}
                          onChange={(e) => setEditNumber(e.target.value)}
                          className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm border px-2 py-1"
                        />
                      ) : (
                        <span className="font-mono bg-gray-100 px-2 py-1 rounded text-xs">{cc.number}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {editingId === cc.id ? (
                        <input
                          type="text"
                          value={editProjectName}
                          onChange={(e) => setEditProjectName(e.target.value)}
                          className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm border px-2 py-1"
                        />
                      ) : (
                        cc.projectName
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      {editingId === cc.id ? (
                        <div className="flex justify-end space-x-2">
                          <button onClick={handleSaveEdit} className="text-green-600 hover:text-green-900" title="Speichern">
                            <Check className="w-5 h-5" />
                          </button>
                          <button onClick={() => setEditingId(null)} className="text-gray-500 hover:text-gray-700" title="Abbrechen">
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex justify-end space-x-3">
                          <button onClick={() => handleEdit(cc)} className="text-blue-600 hover:text-blue-900" title="Bearbeiten">
                            <Edit2 className="w-5 h-5" />
                          </button>
                          <button onClick={() => handleDelete(cc.id)} className="text-red-600 hover:text-red-900" title="Löschen">
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
