import React, { useState, useRef, useEffect } from 'react';
import { Settings, ArrowUp, ArrowDown } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useTranslation } from 'react-i18next';

export interface Column {
  id: string;
  label: string;
}

export function orderColumnsByPreference<T extends { id: string }>(columns: T[], savedOrder: string[] = []): T[] {
  const ids = [...new Set([...savedOrder, ...columns.map(column => column.id)])];
  return ids.flatMap(id => columns.filter(column => column.id === id));
}

export function ColumnConfigDropdown({ columns, tableId }: { columns: Column[]; tableId: string }) {
  const { state, dispatch } = useApp();
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const user = state.currentUser;
  const tableConfig = user?.tableConfig || {};
  const tableColumnOrder = user?.tableColumnOrder || {};
  const orderedColumns = orderColumnsByPreference(columns, tableColumnOrder[tableId]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) setIsOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!user) return null;

  const saveConfig = async (changes: Partial<Pick<typeof user, 'tableConfig' | 'tableColumnOrder'>>) => {
    setSaving(true);
    setError('');
    dispatch({ type: 'UPDATE_CURRENT_USER', payload: changes });
    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes)
      });
      if (!response.ok) throw new Error('Failed to update config');
    } catch {
      dispatch({ type: 'UPDATE_CURRENT_USER', payload: { tableConfig, tableColumnOrder } });
      setError(t('common.columns_save_error', 'Spaltenkonfiguration konnte nicht gespeichert werden.'));
    } finally {
      setSaving(false);
    }
  };

  const moveColumn = (index: number, direction: number) => {
    const ids = orderedColumns.map(column => column.id);
    [ids[index], ids[index + direction]] = [ids[index + direction], ids[index]];
    void saveConfig({ tableColumnOrder: { ...tableColumnOrder, [tableId]: ids } });
  };

  return (
    <div className={`relative inline-block text-left ${isOpen ? 'z-20' : ''}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-blue-500"
        title={t('common.columns_adjust', 'Spalten konfigurieren')}
      >
        <Settings className="w-4 h-4" />
        <span className="hidden sm:inline">{t('common.columns_adjust', 'Spalten konfigurieren')}</span>
      </button>
      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 bg-white border border-gray-200 rounded-md shadow-lg max-h-96 overflow-y-auto">
          <div className="px-4 py-2 text-xs font-semibold text-gray-500">
            {t('common.columns_order', 'Spalten einblenden und anordnen')}
          </div>
          {orderedColumns.map((column, index) => {
            const key = `${tableId}_${column.id}`;
            const label = t(`dashboard.columns.${column.id}`, column.label);
            return (
              <div key={column.id} className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                <label className="flex flex-1 items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={tableConfig[key] !== false} disabled={saving}
                    onChange={() => void saveConfig({ tableConfig: { ...tableConfig, [key]: tableConfig[key] === false } })}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                  {label}
                </label>
                <button type="button" disabled={saving || index === 0} aria-label={`${label}: nach links`} onClick={() => moveColumn(index, -1)} className="p-1 rounded hover:bg-gray-200 disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
                <button type="button" disabled={saving || index === orderedColumns.length - 1} aria-label={`${label}: nach rechts`} onClick={() => moveColumn(index, 1)} className="p-1 rounded hover:bg-gray-200 disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
              </div>
            );
          })}
          {error && <p role="alert" className="px-4 py-2 text-sm text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}

export function useTableColumns(tableId: string) {
  const { state } = useApp();
  const tableConfig = state.currentUser?.tableConfig || {};
  return { isVisible: (columnId: string) => tableConfig[`${tableId}_${columnId}`] !== false };
}

/** Apply the same saved column order and visibility to table headers and data rows. */
export function OrderedTableRow({ tableId, children, ...props }: React.ComponentProps<'tr'> & { tableId: string }) {
  const { state } = useApp();
  const { isVisible } = useTableColumns(tableId);
  const cells = React.Children.toArray(children).filter(React.isValidElement).map(child => {
    const cell = child as React.ReactElement<React.ComponentProps<'td'> & { 'data-column': string }>;
    return { id: cell.props['data-column'], cell };
  }).filter(({ id }) => isVisible(id));
  const ordered = orderColumnsByPreference(cells, state.currentUser?.tableColumnOrder?.[tableId]);
  return <tr {...props} {...(props.onClick ? {
    tabIndex: 0,
    onKeyDown: (event: React.KeyboardEvent<HTMLTableRowElement>) => {
      if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        event.currentTarget.click();
      }
    }
  } : {})}>{ordered.map(({ id, cell }) => React.cloneElement(cell, {
    key: id,
    ...(cell.type === 'th' && cell.props.onClick ? {
      tabIndex: 0,
      className: `${cell.props.className} cursor-pointer hover:bg-gray-100`,
      onKeyDown: (event: React.KeyboardEvent<HTMLTableCellElement>) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          event.currentTarget.click();
        }
      }
    } : {})
  }))}</tr>;
}
