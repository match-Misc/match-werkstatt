import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { ColumnConfigDropdown, useTableColumns } from './ColumnConfigDropdown';
import { Order, SubTask } from '../types';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';


const taskColumns = [
  { id: 'orderTitle', label: 'Auftragstitel' },
  { id: 'projectName', label: 'Projektname' },
  { id: 'subTaskTitle', label: 'Aufgabename' },
  { id: 'assignee', label: 'Mitarbeiter' },
  { id: 'info', label: 'Weitere Informationen' },
  { id: 'priority', label: 'Priorität' },
  { id: 'status', label: 'Zustand' }
];

export default function TaskOverview() {
  const { isVisible } = useTableColumns('tasks');
  const { state, dispatch } = useApp();
  const { t } = useTranslation();
  const navigate = useNavigate();

  // Sorting state
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);

  // Filter state
  const [filters, setFilters] = useState<any>({
    orderTitle: '',
    subTaskTitle: '',
    assignee: '',
    priority: '',
    status: ''
  , projectName: ''});

  const getAllSubTasks = () => {
    const tasks: Array<{ order: Order; subTask: SubTask; assigneeName: string; deadline: number; originalOrderIndex: number }> = [];
    
    state.orders.forEach(order => {
      if (Array.isArray(order.subTasks)) {
        order.subTasks.forEach((subTask, index) => {
          const isOwnTask = subTask.assignedTo === state.currentUser?.id;
          const isAdmin = state.currentUser?.role === 'admin';
          const isVisible = subTask.status !== 'completed' && (isOwnTask || isAdmin);
          
          if (isVisible) {
            const assigneeName = state.workshopAccounts.find(acc => acc.id === subTask.assignedTo)?.name || 'Unbekannt';
            tasks.push({
              order,
              subTask,
              assigneeName,
              deadline: new Date(order.deadline).getTime(),
              originalOrderIndex: subTask.sort_order ?? index
            });
          }
        });
      }
    });

    return tasks;
  };

  const allSubTasks = getAllSubTasks();

  const filteredTasks = useMemo(() => {
    return allSubTasks.filter(task => {
      const matchOrder = task.order.title.toLowerCase().includes(filters.orderTitle.toLowerCase());
      const matchSubTask = task.subTask.title.toLowerCase().includes(filters.subTaskTitle.toLowerCase());
      const matchAssignee = task.assigneeName.toLowerCase().includes(filters.assignee.toLowerCase());
      const matchPriority = filters.priority ? (task.subTask.priority || 'medium') === filters.priority : true;
      const matchStatus = filters.status ? task.subTask.status === filters.status : true;
      
      return matchOrder && matchSubTask && matchAssignee && matchPriority && matchStatus;
    });
  }, [allSubTasks, filters]);

  const sortedTasks = useMemo(() => {
    const sortableTasks = [...filteredTasks];
    
    // Default sorting
    if (!sortConfig) {
      return sortableTasks.sort((a, b) => {
        const titleCompare = a.order.title.localeCompare(b.order.title);
        if (titleCompare !== 0) return titleCompare;
        return a.originalOrderIndex - b.originalOrderIndex;
      });
    }

    // Custom sorting
    return sortableTasks.sort((a, b) => {
      let aValue: any, bValue: any;
      
      switch (sortConfig.key) {
        case 'orderTitle':
          aValue = a.order.title;
          bValue = b.order.title;
          break;
        case 'subTaskTitle':
          aValue = a.subTask.title;
          bValue = b.subTask.title;
          break;
        case 'assignee':
          aValue = a.assigneeName;
          bValue = b.assigneeName;
          break;
        case 'priority':
          const priorityWeight: Record<string, number> = { high: 3, medium: 2, low: 1, undefined: 0 };
          aValue = priorityWeight[a.subTask.priority || 'undefined'] || 0;
          bValue = priorityWeight[b.subTask.priority || 'undefined'] || 0;
          break;
        case 'status':
          aValue = a.subTask.status;
          bValue = b.subTask.status;
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredTasks, sortConfig]);

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const handleUpdateSubTask = async (orderId: string, subTaskId: string, updates: Partial<SubTask>) => {
    const order = state.orders.find(o => o.id === orderId);
    if (!order) return;

    const updatedSubTasks = order.subTasks.map(st => 
      st.id === subTaskId ? { ...st, ...updates, updatedAt: new Date() } : st
    );

    const updatedOrder = { ...order, subTasks: updatedSubTasks };
    dispatch({ type: 'UPDATE_ORDER', payload: updatedOrder });

    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedOrder)
      });
      if (!res.ok) throw new Error('Failed to update order');
    } catch (err) {
      console.error('Fehler beim Aktualisieren der Unteraufgabe', err);
    }
  };

  const getSubTaskScopeText = (order: Order, subTask: SubTask) => {
    if (subTask.scopeType !== 'component') return '📋 Gesamtauftrag';
    const component = order.components?.find((comp: any) => {
      const compId = comp.id || comp._id;
      return compId === subTask.assignedComponentId;
    });
    const componentTitle = component ? (component.title || 'Bauteil') : (subTask.assignedComponentTitle || 'Bauteil');
    return `🔧 ${componentTitle}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-900';
      case 'accepted': return 'bg-blue-100 text-blue-900';
      case 'in_progress': return 'bg-purple-100 text-purple-900';
      case 'revision': return 'bg-orange-100 text-orange-900';
      case 'rework': return 'bg-orange-100 text-orange-900';
      case 'waiting_confirmation': return 'bg-cyan-100 text-cyan-900';
      case 'completed': return 'bg-green-100 text-green-900';
      default: return 'bg-gray-100 text-gray-900';
    }
  };

  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-900';
      case 'medium': return 'bg-yellow-100 text-yellow-900';
      case 'low': return 'bg-green-100 text-green-900';
      default: return 'bg-gray-100 text-gray-900';
    }
  };

  const isOverdue = (deadline: Date) => {
    return new Date(deadline) < new Date(new Date().setHours(0,0,0,0)); // Überfällig, wenn Datum in der Vergangenheit ist
  };

  const isToday = (deadline: Date) => {
    return new Date(deadline).toDateString() === new Date().toDateString();
  };

  const isAdmin = state.currentUser?.role === 'admin';

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8 flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{t('tasks.title', 'Unteraufgaben')}</h2>
          <p className="text-gray-600 mt-1">{t('tasks.subtitle', 'Übersicht aller Unteraufgaben als Liste')}</p>
        </div>
        <ColumnConfigDropdown columns={taskColumns} tableId="tasks" />
      </div>

      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {isVisible('orderTitle') && (
                  <th 
                    scope="col" 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('orderTitle')}
                  >
                    {t('dashboard.columns.title', 'Auftragstitel')} {sortConfig?.key === 'orderTitle' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                )}
                {isVisible('projectName') && (
                  <th 
                    scope="col" 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('projectName')}
                  >
                    {t('dashboard.columns.projectName', 'Projektname')} {sortConfig?.key === 'projectName' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                )}
                {isVisible('subTaskTitle') && (
                  <th 
                  scope="col" 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('subTaskTitle')}
                >
                  {t('tasks.columns.subTaskTitle', 'Aufgabename')} {sortConfig?.key === 'subTaskTitle' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                </th>
                )}
                {isAdmin && isVisible('assignee') && (
                  <th 
                    scope="col" 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('assignee')}
                  >
                    {t('tasks.columns.assignee', 'Mitarbeiter')} {sortConfig?.key === 'assignee' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                )}
                {isVisible('info') && (
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('tasks.columns.info', 'Weitere Informationen')}
                </th>
                )}
                {isVisible('priority') && (
                  <th 
                  scope="col" 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('priority')}
                >
                  Priorität {sortConfig?.key === 'priority' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                </th>
                )}
                {isVisible('status') && (
                  <th 
                  scope="col" 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('status')}
                >
                  {t('common.status', 'Zustand')} {sortConfig?.key === 'status' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                </th>
                )}
              </tr>
              <tr className="bg-gray-100 border-t border-gray-200">
                {isVisible('orderTitle') && (
                  <th className="px-6 py-2">
                    <input
                      type="text"
                      placeholder={t('common.search', 'Filtern...')}
                      className="w-full text-xs border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 font-normal py-1.5 px-2"
                      value={filters.orderTitle}
                      onChange={(e) => setFilters(prev => ({ ...prev, orderTitle: e.target.value }))}
                    />
                  </th>
                )}
                {isVisible('projectName') && (
                  <th className="px-6 py-2">
                    <input
                      type="text"
                      placeholder={t('common.search', 'Filtern...')}
                      className="w-full text-xs border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 font-normal py-1.5 px-2"
                      value={filters.projectName || ''}
                      onChange={(e) => setFilters(prev => ({ ...prev, projectName: e.target.value }))}
                    />
                  </th>
                )}
                {isVisible('subTaskTitle') && (
                  <th className="px-6 py-2">
                  <input
                    type="text"
                    placeholder={t('common.search', 'Filtern...')}
                    className="w-full text-xs border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 font-normal py-1.5 px-2"
                    value={filters.subTaskTitle}
                    onChange={(e) => setFilters(prev => ({ ...prev, subTaskTitle: e.target.value }))}
                  />
                </th>
                )}
                {isAdmin && (
                  <th className="px-6 py-2">
                    <input
                      type="text"
                      placeholder={t('common.search', 'Filtern...')}
                      className="w-full text-xs border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 font-normal py-1.5 px-2"
                      value={filters.assignee}
                      onChange={(e) => setFilters(prev => ({ ...prev, assignee: e.target.value }))}
                    />
                  </th>
                )}
                {isVisible('info') && (
                  <th className="px-6 py-2"></th>
                )}
                {isVisible('priority') && (
                  <th className="px-6 py-2">
                  <select
                    className="w-full text-xs border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 font-normal py-1.5 px-2"
                    value={filters.priority}
                    onChange={(e) => setFilters(prev => ({ ...prev, priority: e.target.value }))}
                  >
                    <option value="">{t('common.all', 'Alle')}</option>
                    <option value="high">{t('dashboard.priority_levels.high', 'Hoch')}</option>
                    <option value="medium">{t('dashboard.priority_levels.medium', 'Mittel')}</option>
                    <option value="low">{t('dashboard.priority_levels.low', 'Tief')}</option>
                  </select>
                </th>
                )}
                {isVisible('status') && (
                  <th className="px-6 py-2">
                  <select
                    className="w-full text-xs border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 font-normal py-1.5 px-2"
                    value={filters.status}
                    onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                  >
                    <option value="">{t('common.all', 'Alle')}</option>
                    <option value="pending">{t('dashboard.pending', 'Ausstehend')}</option>
                    <option value="in_progress">{t('dashboard.in_progress', 'In Bearbeitung')}</option>
                    <option value="completed">{t('dashboard.completed', 'Abgeschlossen')}</option>
                  </select>
                </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sortedTasks.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 7 : 6} className="px-6 py-4 text-center text-sm text-gray-500">
                    Keine Unteraufgaben gefunden.
                  </td>
                </tr>
              ) : (
                sortedTasks.map(({ order, subTask, assigneeName }) => (
                  <tr 
                    key={`${order.id}-${subTask.id}`} 
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => navigate(`/orders/${order.orderNumber || order.id}?tab=subtasks`)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {order.title}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {subTask.title}
                    </td>
                    {isAdmin && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {assigneeName}
                      </td>
                    )}
                    <td className="px-6 py-4 text-sm text-gray-500">
                      <div className="flex flex-col space-y-1">
                        <span className="truncate max-w-xs">{subTask.description}</span>
                        <span className="text-xs">{getSubTaskScopeText(order, subTask)}</span>
                        <span className={`text-xs ${isOverdue(order.deadline) ? 'text-red-600 font-bold' : (isToday(order.deadline) ? 'text-orange-500 font-bold' : '')}`}>
                          Deadline: {new Date(order.deadline).toLocaleDateString('de-DE')}
                        </span>
                        {subTask.estimatedHours > 0 && <span className="text-xs">Geschätzt: {subTask.estimatedHours}h</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <select
                        value={subTask.priority || 'medium'}
                        onChange={(e) => {
                          e.stopPropagation();
                          handleUpdateSubTask(order.id, subTask.id, { priority: e.target.value as any });
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className={`mt-1 block w-full pl-3 pr-10 py-1.5 text-sm font-medium border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 rounded-md ${getPriorityColor(subTask.priority || 'medium')}`}
                      >
                        <option value="high" className="bg-white text-gray-900">Hoch</option>
                        <option value="medium" className="bg-white text-gray-900">Mittel</option>
                        <option value="low" className="bg-white text-gray-900">Tief</option>
                      </select>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <select
                        value={subTask.status}
                        onChange={(e) => {
                          e.stopPropagation();
                          handleUpdateSubTask(order.id, subTask.id, { status: e.target.value as any });
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className={`mt-1 block w-full pl-3 pr-10 py-1.5 text-sm font-medium border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 rounded-md ${getStatusColor(subTask.status)}`}
                      >
                        <option value="pending" className="bg-white text-gray-900">Ausstehend</option>
                        <option value="in_progress" className="bg-white text-gray-900">In Bearbeitung</option>
                        <option value="completed" className="bg-white text-gray-900">Abgeschlossen</option>
                      </select>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
