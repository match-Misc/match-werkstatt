import React from 'react';
import { useApp } from '../context/AppContext';
import { Clock, ShieldAlert } from 'lucide-react';

export default function GuestDashboard() {
  const { state } = useApp();
  const user = state.currentUser;

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
      <div className="bg-white overflow-hidden shadow rounded-lg border border-gray-200">
        <div className="px-4 py-5 sm:p-6 text-center">
          <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-blue-100 mb-6">
            <ShieldAlert className="h-8 w-8 text-blue-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Willkommen, {user?.name || user?.username}!
          </h2>
          <div className="bg-amber-50 border-l-4 border-amber-400 p-4 max-w-2xl mx-auto rounded-r-md">
            <div className="flex">
              <div className="flex-shrink-0">
                <Clock className="h-5 w-5 text-amber-400" aria-hidden="true" />
              </div>
              <div className="ml-3">
                <p className="text-sm text-amber-700">
                  Dein Account wurde registriert. Bitte warte auf die Freischaltung durch einen Administrator.
                </p>
              </div>
            </div>
          </div>
          <p className="mt-6 text-sm text-gray-500">
            Sobald dein Account freigeschaltet wurde, hast du Zugriff auf die Auftragsverwaltung.
          </p>
        </div>
      </div>
    </div>
  );
}
