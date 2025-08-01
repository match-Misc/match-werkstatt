import React, { useState } from 'react';

interface EndabnahmeActionsProps {
  onConfirm: (note: string) => void;
  onRequestRevision: (revisionComment: string, newDeadline?: string) => void;
  loading?: boolean;
}

export default function EndabnahmeActions({ onConfirm, onRequestRevision, loading }: EndabnahmeActionsProps) {
  const [note, setNote] = useState('');
  const [revisionComment, setRevisionComment] = useState('');
  const [newDeadline, setNewDeadline] = useState('');
  const [showRevisionModal, setShowRevisionModal] = useState(false);

  const handleRequestRevisionClick = () => {
    setShowRevisionModal(true);
  };

  const handleConfirmRevision = () => {
    if (revisionComment.trim()) {
      onRequestRevision(revisionComment, newDeadline);
      setShowRevisionModal(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 mt-4 border-t pt-4">
      <div className="flex flex-col md:flex-row gap-4">
        <button
          onClick={() => onConfirm(note)}
          disabled={loading}
          className="flex-1 flex items-center justify-center px-4 py-3 bg-green-600 text-white rounded-lg shadow hover:bg-green-700 transition-colors text-lg font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <svg className="w-6 h-6 mr-2" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
          Endabnahme bestätigen
        </button>
        <button
          onClick={handleRequestRevisionClick}
          disabled={loading}
          className="flex-1 flex items-center justify-center px-4 py-3 bg-orange-600 text-white rounded-lg shadow hover:bg-orange-700 transition-colors text-lg font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <svg className="w-6 h-6 mr-2" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0V9m0 0C4.582 14.523 9.477 19 15 19c1.657 0 3-1.343 3-3 0-1.657-1.343-3-3-3H9" /></svg>
          Nacharbeit anfordern
        </button>
      </div>
      <div className="flex flex-col md:flex-row gap-4 mt-2">
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 mb-1">Kommentar zur Endabnahme (optional)</label>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            rows={2}
            placeholder="Kommentar für die Werkstatt ..."
          />
        </div>
      </div>

      {showRevisionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-8 rounded-lg shadow-xl max-w-lg w-full">
            <h3 className="text-xl font-bold mb-4">Kommentar zur Nacharbeit</h3>
            <p className="mb-4 text-gray-700">Bitte geben Sie einen Kommentar zur Nacharbeit ein...</p>
            <textarea
              value={revisionComment}
              onChange={e => setRevisionComment(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              rows={4}
              placeholder="Was soll überarbeitet werden?"
            />
            <div className="flex justify-end gap-4 mt-4">
              <button onClick={() => setShowRevisionModal(false)} className="text-gray-600">Abbrechen</button>
              <button
                onClick={handleConfirmRevision}
                disabled={!revisionComment.trim() || loading}
                className="bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 disabled:bg-gray-400"
              >
                Absenden
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
