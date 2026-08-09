import React, { useState, useRef, useEffect } from 'react';
import { Settings } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useTranslation } from 'react-i18next';

export interface Column {
  id: string;
  label: string;
}

interface ColumnConfigDropdownProps {
  columns: Column[];
  tableId: string;
}

export function ColumnConfigDropdown({ columns, tableId }: ColumnConfigDropdownProps) {
  const { state, dispatch } = useApp();
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const user = state.currentUser;
  const tableConfig = user?.tableConfig || {};

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!user) return null;

  const toggleColumn = async (columnId: string) => {
    const key = `${tableId}_${columnId}`;
    // By default, if not in config, assume it's visible (true)
    const isVisible = tableConfig[key] !== false;
    
    const newConfig = { ...tableConfig, [key]: !isVisible };
    
    // Optimistic UI update
    dispatch({
      type: 'UPDATE_CURRENT_USER',
      payload: { tableConfig: newConfig }
    });

    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...user,
          tableConfig: newConfig
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to update config');
      }
    } catch (err) {
      console.error('Error updating table config:', err);
      // Revert on error
      dispatch({
        type: 'UPDATE_CURRENT_USER',
        payload: { tableConfig }
      });
    }
  };

  return (
    <div className="relative inline-block text-left z-10" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none"
        title={t('common.columns_adjust', 'Spalten anpassen')}
      >
        <Settings className="w-4 h-4" />
        <span className="hidden sm:inline">{t('common.columns_adjust', 'Spalten anpassen')}</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 origin-top-right bg-white border border-gray-200 divide-y divide-gray-100 rounded-md shadow-lg outline-none max-h-96 overflow-y-auto">
          <div className="py-1">
            <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              {t('common.visible_columns', 'Sichtbare Spalten')}
            </div>
            {columns.map(col => {
              const key = `${tableId}_${col.id}`;
              const isVisible = tableConfig[key] !== false;
              return (
                <label key={col.id} className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mr-3 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    checked={isVisible}
                    onChange={() => toggleColumn(col.id)}
                  />
                  <span className="ml-2 text-sm text-gray-700">{t(`dashboard.columns.${col.id}`, col.label)}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function useTableColumns(tableId: string) {
  const { state } = useApp();
  const tableConfig = state.currentUser?.tableConfig || {};
  
  const isVisible = (columnId: string) => {
    return tableConfig[`${tableId}_${columnId}`] !== false;
  };

  return { isVisible };
}
