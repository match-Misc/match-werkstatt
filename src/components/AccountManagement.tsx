import React, { useState, useEffect } from 'react';
import { X, Plus, Edit2, Trash2, User, Building2, Shield, Server } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { WorkshopAccount } from '../types';
import NetworkConfigAdmin from './NetworkConfigAdmin';
import LDAPManagement from './LDAPManagement';
import MaterialManagement from './MaterialManagement';

interface AccountManagementProps {
  onClose: () => void;
}

export default function AccountManagement({ onClose }: AccountManagementProps) {
  const { state, dispatch } = useApp();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<WorkshopAccount | null>(null);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    name: '',
    role: 'workshop' as 'workshop' | 'admin'
  });

  // --- NEU: State für Kunden-Bearbeitung ---
  const [editingClient, setEditingClient] = useState<any | null>(null);
  const [clientForm, setClientForm] = useState({
    name: '',
    username: '',
    company: '',
    email: ''
  });

  // Lade Accounts beim Öffnen der Komponente
  useEffect(() => {
    const loadAccounts = async () => {
      try {
        const response = await fetch('/api/users');
        if (response.ok) {
          const users = await response.json();
          dispatch({ type: 'LOAD_WORKSHOP_ACCOUNTS', payload: users.filter((u: any) => u.role === 'workshop' || u.role === 'admin') });
          dispatch({ type: 'LOAD_CLIENT_ACCOUNTS', payload: users.filter((u: any) => u.role === 'client') });
        }
      } catch (error) {
        console.error('Fehler beim Laden der Accounts:', error);
      }
    };
    
    loadAccounts();
  }, [dispatch]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingAccount) {
      // Update existing account via backend
      try {
        const updateData: any = {
          username: formData.username,
          name: formData.name,
          role: formData.role,
          updatedAt: new Date()
        };
        
        // Only include password if it's not empty
        if (formData.password && formData.password.trim() !== '') {
          updateData.password = formData.password;
        }
        
        const response = await fetch(`/api/users/${editingAccount.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateData)
        });

        if (response.ok) {
          const updatedUser = await response.json();
          dispatch({ type: 'UPDATE_WORKSHOP_ACCOUNT', payload: updatedUser });
          setEditingAccount(null);
          
          dispatch({
            type: 'SHOW_NOTIFICATION',
            payload: {
              message: 'Account erfolgreich aktualisiert',
              type: 'success'
            }
          });
        } else {
          throw new Error('Fehler beim Aktualisieren des Accounts');
        }
      } catch (error) {
        console.error('Fehler beim Aktualisieren des Accounts:', error);
        dispatch({
          type: 'SHOW_NOTIFICATION',
          payload: {
            message: 'Fehler beim Aktualisieren des Accounts',
            type: 'error'
          }
        });
        return;
      }
    } else {
      // Backend-Call für neuen User
      try {
        const response = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: formData.username,
            password: formData.password,
            name: formData.name,
            role: formData.role
          })
        });
        if (!response.ok) {
          alert('Fehler beim Anlegen des Accounts!');
          return;
        }
        const newUser = await response.json();
        dispatch({ type: 'ADD_WORKSHOP_ACCOUNT', payload: newUser });
        
        // Accounts neu laden um sicherzustellen, dass alle Daten aktuell sind
        const allUsersResponse = await fetch('/api/users');
        if (allUsersResponse.ok) {
          const users = await allUsersResponse.json();
          dispatch({ type: 'LOAD_WORKSHOP_ACCOUNTS', payload: users.filter((u: any) => u.role === 'workshop' || u.role === 'admin') });
          dispatch({ type: 'LOAD_CLIENT_ACCOUNTS', payload: users.filter((u: any) => u.role === 'client') });
        }
      } catch (err) {
        alert('Netzwerkfehler beim Anlegen des Accounts!');
        return;
      }
    }
    setFormData({ username: '', password: '', name: '', role: 'workshop' });
    setShowAddForm(false);
  };

  const handleEdit = (account: WorkshopAccount) => {
    setEditingAccount(account);
    setFormData({
      username: account.username,
      password: '', // Passwort-Feld beim Bearbeiten leer lassen
      name: account.name,
      role: account.role
    });
    setShowAddForm(true);
  };

  const handleDelete = async (accountId: string) => {
    if (accountId === state.currentUser?.id) {
      alert('Sie können Ihren eigenen Account nicht löschen');
      return;
    }
    if (confirm('Sind Sie sicher, dass Sie diesen Account löschen möchten?')) {
      await fetch(`/api/users/${accountId}`, { method: 'DELETE' });
      dispatch({ type: 'DELETE_WORKSHOP_ACCOUNT', payload: accountId });
      
      // Accounts neu laden
      const response = await fetch('/api/users');
      if (response.ok) {
        const users = await response.json();
        dispatch({ type: 'LOAD_WORKSHOP_ACCOUNTS', payload: users.filter((u: any) => u.role === 'workshop' || u.role === 'admin') });
        dispatch({ type: 'LOAD_CLIENT_ACCOUNTS', payload: users.filter((u: any) => u.role === 'client') });
      }
    }
  };

  const resetForm = () => {
    setFormData({ username: '', password: '', name: '', role: 'workshop' });
    setEditingAccount(null);
    setShowAddForm(false);
  };

  const handleEditClient = (account: any) => {
    setEditingClient(account);
    setClientForm({
      name: account.name || '',
      username: account.username || '',
      company: account.company || '',
      email: account.email || ''
    });
  };

  const handleClientFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setClientForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSaveClient = async () => {
    const updated = { ...editingClient, ...clientForm };
    
    try {
      const response = await fetch(`/api/users/${editingClient.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updated)
      });

      if (response.ok) {
        dispatch({ type: 'UPDATE_CLIENT_ACCOUNT', payload: updated });
        setEditingClient(null);
        
        dispatch({
          type: 'SHOW_NOTIFICATION',
          payload: {
            message: 'Auftraggeber-Account erfolgreich aktualisiert',
            type: 'success'
          }
        });
      } else {
        throw new Error('Fehler beim Aktualisieren des Accounts');
      }
    } catch (error) {
      console.error('Fehler beim Speichern der Client-Änderungen:', error);
      dispatch({
        type: 'SHOW_NOTIFICATION',
        payload: {
          message: 'Fehler beim Aktualisieren des Accounts',
          type: 'error'
        }
      });
    }
  };

  const handleDeleteClient = async (id: string) => {
    if (window.confirm('Diesen Auftraggeber-Account wirklich löschen?')) {
      await fetch(`/api/users/${id}`, { method: 'DELETE' });
      dispatch({ type: 'DELETE_CLIENT_ACCOUNT', payload: id });
      
      // Accounts neu laden
      const response = await fetch('/api/users');
      if (response.ok) {
        const users = await response.json();
        dispatch({ type: 'LOAD_WORKSHOP_ACCOUNTS', payload: users.filter((u: any) => u.role === 'workshop' || u.role === 'admin') });
        dispatch({ type: 'LOAD_CLIENT_ACCOUNTS', payload: users.filter((u: any) => u.role === 'client') });
      }
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="flex justify-between items-center p-6 border-b">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Benutzerverwaltung</h2>
            <p className="text-gray-600 mt-1">Werkstatt-Accounts verwalten</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Netzwerkkonfiguration (nur für Admins sichtbar) */}
        {state.currentUser?.role === 'admin' && (
          <div className="p-6 border-b">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Systemkonfiguration</h3>
            <NetworkConfigAdmin />
            
            <div className="mt-6 pt-6 border-t">
              <h4 className="text-md font-semibold text-gray-900 mb-4 flex items-center">
                <Server className="w-4 h-4 mr-2" />
                LDAP-Verwaltung
              </h4>
              <LDAPManagement />
            </div>

            <div className="mt-6 pt-6 border-t">
              <MaterialManagement />
            </div>
          </div>
        )}

        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-semibold text-gray-900">Werkstatt-Accounts</h3>
            <button
              onClick={() => setShowAddForm(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center"
            >
              <Plus className="w-4 h-4 mr-2" />
              Neuen Account erstellen
            </button>
          </div>

          {showAddForm && (
            <div className="bg-gray-50 rounded-lg p-6 mb-6">
              <h4 className="text-md font-semibold text-gray-900 mb-4">
                {editingAccount ? 'Account bearbeiten' : 'Neuen Account erstellen'}
              </h4>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Benutzername *
                    </label>
                    <input
                      type="text"
                      value={formData.username}
                      onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Passwort {editingAccount ? '(leer lassen für keine Änderung)' : '*'}
                    </label>
                    <input
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required={!editingAccount}
                      placeholder={editingAccount ? 'Neues Passwort eingeben oder leer lassen' : 'Passwort eingeben'}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Vollständiger Name *
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Rolle *
                    </label>
                    <select
                      value={formData.role}
                      onChange={(e) => setFormData(prev => ({ ...prev, role: e.target.value as 'workshop' | 'admin' }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="workshop">Werkstatt-Mitarbeiter</option>
                      <option value="admin">Administrator</option>
                    </select>
                  </div>
                </div>
                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Abbrechen
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    {editingAccount ? 'Aktualisieren' : 'Erstellen'}
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Benutzer
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Benutzername
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Rolle
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Erstellt
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Aktionen
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {state.workshopAccounts.map((account) => (
                  <tr key={account.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          account.role === 'admin' ? 'bg-purple-100' : 'bg-blue-100'
                        }`}>
                          {account.role === 'admin' ? (
                            <Shield className="w-5 h-5 text-purple-600" />
                          ) : (
                            <User className="w-5 h-5 text-blue-600" />
                          )}
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">{account.name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{account.username}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        account.role === 'admin' 
                          ? 'bg-purple-100 text-purple-800' 
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {account.role === 'admin' ? 'Administrator' : 'Werkstatt'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        account.isActive 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {account.isActive ? 'Aktiv' : 'Inaktiv'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {account.createdAt ? new Date(account.createdAt).toLocaleDateString('de-DE') : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleEdit(account)}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        {account.id !== state.currentUser?.id && (
                          <button
                            onClick={() => handleDelete(account.id)}
                            className="text-red-600 hover:text-red-800"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-8 border-t pt-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Auftraggeber-Accounts</h3>
            {state.clientAccounts.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Benutzername
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Firma
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        E-Mail
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Registriert
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Aktionen
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {state.clientAccounts.map((account) => (
                      editingClient?.id === account.id ? (
                        <tr key={account.id} className="bg-yellow-50">
                          <td className="px-6 py-4 whitespace-nowrap" colSpan={5}>
                            <div className="flex flex-col md:flex-row gap-2 items-center">
                              <input
                                type="text"
                                name="name"
                                value={clientForm.name}
                                onChange={handleClientFormChange}
                                placeholder="Name"
                                className="border px-2 py-1 rounded mr-2"
                              />
                              <input
                                type="text"
                                name="username"
                                value={clientForm.username}
                                onChange={handleClientFormChange}
                                placeholder="Benutzername"
                                className="border px-2 py-1 rounded mr-2"
                              />
                              <input
                                type="text"
                                name="company"
                                value={clientForm.company}
                                onChange={handleClientFormChange}
                                placeholder="Firma"
                                className="border px-2 py-1 rounded mr-2"
                              />
                              <input
                                type="email"
                                name="email"
                                value={clientForm.email}
                                onChange={handleClientFormChange}
                                placeholder="E-Mail"
                                className="border px-2 py-1 rounded mr-2"
                              />
                              <button onClick={handleSaveClient} className="bg-green-600 text-white px-3 py-1 rounded mr-2">Speichern</button>
                              <button onClick={() => setEditingClient(null)} className="bg-gray-300 px-3 py-1 rounded">Abbrechen</button>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        <tr key={account.id} className={account.isApproved ? "hover:bg-gray-50" : "bg-yellow-50"}>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                                <User className="w-5 h-5 text-green-600" />
                              </div>
                              <div className="ml-4">
                                <div className="text-sm font-medium text-gray-900">{account.name}</div>
                                {!account.isApproved && <div className="text-xs text-yellow-700">Nicht bestätigt</div>}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{account.username}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{account.company || '-'}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{account.email || '-'}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {new Date(account.createdAt).toLocaleDateString('de-DE')}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <div className="flex space-x-2">
                              <button onClick={() => handleEditClient(account)} className="text-blue-600 hover:text-blue-800"><Edit2 className="w-4 h-4" /></button>
                              <button onClick={() => handleDeleteClient(account.id)} className="text-red-600 hover:text-red-800"><Trash2 className="w-4 h-4" /></button>
                              {!account.isApproved && (
                                <button
                                  onClick={async () => {
                                    await fetch(`/api/users/${account.id}/approve`, { method: 'PATCH' });
                                    dispatch({ type: 'APPROVE_CLIENT_ACCOUNT', payload: account.id });
                                  }}
                                  className="bg-green-600 text-white px-3 py-1 rounded text-xs hover:bg-green-700"
                                >
                                  Bestätigen
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8">Keine Auftraggeber-Accounts registriert</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}