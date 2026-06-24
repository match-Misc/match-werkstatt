import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Order } from '../types';
import WorkshopOrderDetails from './WorkshopOrderDetails';

export default function TaskOverview() {
  const { state } = useApp();
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  const getMySubTasks = () => {
    if (!['workshop', 'employee', 'manager'].includes(state.currentUser?.role || '')) return [];
    
    const mySubTasks: Array<{order: Order, subTask: any}> = [];
    state.orders.forEach(order => {
      if (Array.isArray(order.subTasks)) {
        order.subTasks.forEach(subTask => {
          if (subTask.assignedTo === state.currentUser?.id && subTask.status !== 'completed') {
            mySubTasks.push({ order, subTask });
          }
        });
      }
    });
    return mySubTasks;
  };

  const getAdminOwnSubTasks = () => {
    if (state.currentUser?.role !== 'admin') return [];

    const ownSubTasks: Array<{ order: Order; subTask: any; deadline: number }> = [];
    state.orders.forEach((order) => {
      if (!Array.isArray(order.subTasks)) return;
      order.subTasks.forEach((subTask) => {
        if (subTask.assignedTo === state.currentUser?.id && subTask.status !== 'completed') {
          ownSubTasks.push({
            order,
            subTask,
            deadline: new Date(order.deadline).getTime()
          });
        }
      });
    });

    return ownSubTasks.sort((a, b) => a.deadline - b.deadline);
  };

  const getAdminTeamPlannedSubTasks = () => {
    if (state.currentUser?.role !== 'admin') return [];

    const plannedSubTasks: Array<{ order: Order; subTask: any; assigneeName: string; deadline: number }> = [];
    state.orders.forEach((order) => {
      if (!Array.isArray(order.subTasks)) return;
      order.subTasks.forEach((subTask) => {
        if (subTask.status === 'pending' && subTask.assignedTo && subTask.assignedTo !== state.currentUser?.id) {
          const assigneeName = state.workshopAccounts.find(acc => acc.id === subTask.assignedTo)?.name || 'Unbekannt';
          plannedSubTasks.push({
            order,
            subTask,
            assigneeName,
            deadline: new Date(order.deadline).getTime()
          });
        }
      });
    });

    return plannedSubTasks.sort((a, b) => a.deadline - b.deadline);
  };

  const getSubTaskScopeText = (order: Order, subTask: any) => {
    if (subTask.scopeType !== 'component') {
      return '📋 Gesamtauftrag';
    }

    const component = order.components?.find((comp: any) => {
      const compId = comp.id || comp._id;
      return compId === subTask.assignedComponentId;
    });

    const componentTitle = component
      ? (component.title || component.name || 'Bauteil')
      : (subTask.assignedComponentTitle || 'Bauteil');

    return `🔧 ${componentTitle}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'accepted': return 'bg-blue-100 text-blue-800';
      case 'in_progress': return 'bg-purple-100 text-purple-800';
      case 'revision': return 'bg-orange-100 text-orange-800';
      case 'rework': return 'bg-orange-100 text-orange-800';
      case 'waiting_confirmation': return 'bg-cyan-100 text-cyan-800';
      case 'completed': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending': return 'Ausstehend';
      case 'accepted': return 'Angenommen';
      case 'in_progress': return 'In Bearbeitung';
      case 'revision': return 'Überarbeitung';
      case 'rework': return 'In Nacharbeit';
      case 'waiting_confirmation': return 'Wartet auf Abnahme';
      case 'completed': return 'Abgeschlossen';
      default: return status;
    }
  };

  const mySubTasks = getMySubTasks();
  const adminOwnSubTasks = getAdminOwnSubTasks();
  const adminTeamPlannedSubTasks = getAdminTeamPlannedSubTasks();

  if (selectedOrder) {
    return <WorkshopOrderDetails order={selectedOrder} onClose={() => setSelectedOrder(null)} />;
  }

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">Unteraufgaben</h2>
        <p className="text-gray-600 mt-1">Ihre zugewiesenen Unteraufgaben und Team-Planung</p>
      </div>

      {state.currentUser?.role === 'admin' ? (
        <div className="space-y-6">
          <div className="bg-blue-50 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Meine Unteraufgaben</h3>
            {adminOwnSubTasks.length === 0 ? (
              <p className="text-sm text-gray-500">Keine offenen eigenen Unteraufgaben.</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {adminOwnSubTasks.map(({ order, subTask }) => (
                  <div key={subTask.id} className="bg-white rounded-lg p-4 shadow-sm border">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h4 className="font-medium text-gray-900 text-sm">{subTask.title}</h4>
                        <p className="text-xs text-gray-600 mt-1">{subTask.description}</p>
                        <p className="text-xs text-gray-500 mt-1">{getSubTaskScopeText(order, subTask)}</p>
                      </div>
                      <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(subTask.status)}`}>
                        {getStatusText(subTask.status)}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mb-2">Hauptauftrag: {order.title}</div>
                    <div className="flex justify-between items-center mt-2">
                      <div className="text-xs text-gray-500">Deadline: {new Date(order.deadline).toLocaleDateString('de-DE')}</div>
                      <button
                        onClick={() => setSelectedOrder(order)}
                        className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                      >
                        Öffnen
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Geplante Team-Unteraufgaben (Statusübersicht)</h3>
            {adminTeamPlannedSubTasks.length === 0 ? (
              <p className="text-sm text-gray-500">Keine geplanten Team-Unteraufgaben.</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {adminTeamPlannedSubTasks.map(({ order, subTask, assigneeName }) => (
                  <div key={subTask.id} className="bg-gray-50 rounded-lg p-4 border">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h4 className="font-medium text-gray-900 text-sm">{subTask.title}</h4>
                        <p className="text-xs text-gray-600 mt-1">Mitarbeiter: {assigneeName}</p>
                        <p className="text-xs text-gray-600">Auftrag: {order.title}</p>
                        <p className="text-xs text-gray-500 mt-1">{getSubTaskScopeText(order, subTask)}</p>
                      </div>
                      <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(subTask.status)}`}>
                        {getStatusText(subTask.status)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center mt-2">
                      <div className="text-xs text-gray-500">Deadline: {new Date(order.deadline).toLocaleDateString('de-DE')}</div>
                      <button
                        onClick={() => setSelectedOrder(order)}
                        className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                      >
                        Öffnen
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-blue-50 rounded-lg p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Meine Unteraufgaben</h3>
          {mySubTasks.length === 0 ? (
            <p className="text-sm text-gray-500">Keine offenen eigenen Unteraufgaben.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {mySubTasks.map(({ order, subTask }) => (
                <div key={subTask.id} className="bg-white rounded-lg p-4 shadow-sm border">
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-medium text-gray-900 text-sm">{subTask.title}</h4>
                    <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(subTask.status)}`}>
                      {getStatusText(subTask.status)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 mb-2">{subTask.description}</p>
                  <div className="text-xs text-gray-500 mb-2">
                    Hauptauftrag: {order.title}
                  </div>
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>{subTask.estimatedHours}h geschätzt</span>
                    <button
                      onClick={() => setSelectedOrder(order)}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      Öffnen
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
