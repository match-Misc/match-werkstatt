import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { Calendar, Filter, PieChart as PieChartIcon, TrendingUp, Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { getOnTimeDeliveryStatus } from '../utils/onTimeDelivery';

export default function AnalyticsDashboard() {
  const { state } = useApp();
  const { t } = useTranslation();

  const [dateType, setDateType] = useState<'createdAt' | 'updatedAt' | 'confirmationDate'>('createdAt');
  const [timeRange, setTimeRange] = useState<'all' | 'last30' | 'thisYear'>('all');

  // Filter Orders based on Time Range & Date Type
  const filteredOrders = useMemo(() => {
    return state.orders.filter(order => {
      let dateValue = order[dateType];
      if (!dateValue) return false;
      
      const date = new Date(dateValue);
      if (isNaN(date.getTime())) return false;

      const now = new Date();
      if (timeRange === 'last30') {
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        return date >= thirtyDaysAgo;
      } else if (timeRange === 'thisYear') {
        return date.getFullYear() === now.getFullYear();
      }
      return true;
    });
  }, [state.orders, dateType, timeRange]);

  // KPIs
  const totalOrders = filteredOrders.length;
  
  const totalComponents = useMemo(() => {
    return filteredOrders.reduce((sum, order) => {
      const orderComps = order.components?.reduce((cSum, comp) => cSum + (comp.quantity || 1), 0) || 0;
      return sum + orderComps;
    }, 0);
  }, [filteredOrders]);

  const reworkRate = useMemo(() => {
    if (totalOrders === 0) return 0;
    const reworkCount = filteredOrders.filter(order => 
      (order.revisionHistory && order.revisionHistory.length > 0) || 
      (order.reworkComments && order.reworkComments.length > 0)
    ).length;
    return (reworkCount / totalOrders) * 100;
  }, [filteredOrders, totalOrders]);

  // Order Types (Service vs Fertigung)
  const typeData = useMemo(() => {
    let service = 0, fertigung = 0;
    filteredOrders.forEach(o => {
      if (o.orderType === 'service') service++;
      else fertigung++;
    });
    return [
      { name: t('analytics.service', 'Service'), value: service },
      { name: t('analytics.manufacturing', 'Fertigung'), value: fertigung }
    ].filter(d => d.value > 0);
  }, [filteredOrders, t]);

  // Priorities
  const priorityData = useMemo(() => {
    let high = 0, medium = 0, low = 0;
    filteredOrders.forEach(o => {
      if (o.priority === 'high') high++;
      else if (o.priority === 'medium') medium++;
      else low++;
    });
    return [
      { name: t('priority.high', 'Hoch'), value: high },
      { name: t('priority.medium', 'Mittel'), value: medium },
      { name: t('priority.low', 'Niedrig'), value: low }
    ].filter(d => d.value > 0);
  }, [filteredOrders, t]);

  // Clients
  const clientData = useMemo(() => {
    const map = new Map<string, number>();
    filteredOrders.forEach(o => {
      const client = o.clientName || 'Unknown';
      map.set(client, (map.get(client) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [filteredOrders]);

  // Cost Centers
  const costCenterData = useMemo(() => {
    const map = new Map<string, number>();
    filteredOrders.forEach(o => {
      const cc = o.costCenter || 'Unknown';
      map.set(cc, (map.get(cc) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [filteredOrders]);

  // On-Time Delivery
  const onTimeData = useMemo(() => {
    let onTime = 0, late = 0;
    filteredOrders.filter(o => o.status === 'completed' || o.status === 'archived').forEach(o => {
      const deliveryStatus = getOnTimeDeliveryStatus(o);
      if (deliveryStatus === 'onTime') onTime++;
      if (deliveryStatus === 'late') late++;
    });
    return [
      { name: t('analytics.onTime', 'Pünktlich'), value: onTime },
      { name: t('analytics.late', 'Verspätet'), value: late }
    ].filter(d => d.value > 0);
  }, [filteredOrders, t]);

  // Employee Subtask Performance
  const employeeData = useMemo(() => {
    const map = new Map<string, { completed: number, actualHours: number, estimatedHours: number }>();
    
    // Wir iterieren über alle Subtasks der gefilterten Orders
    filteredOrders.forEach(order => {
      (order.subTasks || []).forEach(st => {
        if (!st.assignedTo) return;
        const current = map.get(st.assignedTo) || { completed: 0, actualHours: 0, estimatedHours: 0 };
        
        if (st.status === 'completed') {
          current.completed++;
        }
        current.actualHours += (st.actualHours || 0);
        current.estimatedHours += (st.estimatedHours || 0);
        map.set(st.assignedTo, current);
      });
    });

    return Array.from(map.entries()).map(([userId, data]) => {
      // Find user name
      const user = state.workshopAccounts?.find(u => u.id === userId);
      const name = user ? user.name : userId;
      
      const diff = data.actualHours - data.estimatedHours;
      const percentageOff = data.estimatedHours > 0 ? ((data.actualHours / data.estimatedHours) - 1) * 100 : 0;
      
      return {
        name,
        completed: data.completed,
        actualHours: Number(data.actualHours.toFixed(1)),
        estimatedHours: Number(data.estimatedHours.toFixed(1)),
        diff: Number(diff.toFixed(1)),
        percentageOff: Number(percentageOff.toFixed(1))
      };
    }).sort((a, b) => b.completed - a.completed);
  }, [filteredOrders, state.workshopAccounts]);

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];
  const PRIO_COLORS = { 'Hoch': '#EF4444', 'Mittel': '#F59E0B', 'Niedrig': '#10B981', 'High': '#EF4444', 'Medium': '#F59E0B', 'Low': '#10B981' };
  const TYPE_COLORS = ['#3B82F6', '#8B5CF6'];
  const ONTIME_COLORS = ['#10B981', '#EF4444'];

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-8 bg-gray-50 min-h-screen">
      <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center">
            <PieChartIcon className="w-6 h-6 mr-2 text-blue-600" />
            {t('analytics.title', 'Auswertungen & Analytics')}
          </h1>
          <p className="text-sm text-gray-500 mt-1">{t('analytics.subtitle', 'Überblick über die Auftragsdaten und Werkstattauslastung')}</p>
        </div>
        
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 bg-white p-3 rounded-lg shadow-sm border border-gray-200">
          <div className="flex flex-col">
            <label className="text-xs text-gray-500 font-medium mb-1 flex items-center"><Calendar className="w-3 h-3 mr-1"/> {t('analytics.dateReference', 'Datum-Bezug')}</label>
            <select 
              value={dateType} 
              onChange={(e) => setDateType(e.target.value as any)}
              className="text-sm border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="createdAt">{t('analytics.dateCreated', 'Erstelldatum')}</option>
              <option value="updatedAt">{t('analytics.dateFinished', 'Zuletzt aktualisiert (Abgeschlossen)')}</option>
              <option value="confirmationDate">{t('analytics.dateConfirmed', 'Endabnahme-Datum')}</option>
            </select>
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-500 font-medium mb-1 flex items-center"><Filter className="w-3 h-3 mr-1"/> {t('analytics.timeRange', 'Zeitraum')}</label>
            <select 
              value={timeRange} 
              onChange={(e) => setTimeRange(e.target.value as any)}
              className="text-sm border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="all">{t('analytics.allTime', 'Alle Zeiten')}</option>
              <option value="last30">{t('analytics.last30', 'Letzte 30 Tage')}</option>
              <option value="thisYear">{t('analytics.thisYear', 'Dieses Jahr')}</option>
            </select>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center">
          <div className="bg-blue-50 p-4 rounded-full mr-4">
            <TrendingUp className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">{t('analytics.totalOrders', 'Gesamtaufträge')}</p>
            <p className="text-2xl font-bold text-gray-900">{totalOrders}</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center">
          <div className="bg-purple-50 p-4 rounded-full mr-4">
            <PieChartIcon className="w-6 h-6 text-purple-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">{t('analytics.totalComponents', 'Bauteile gesamt')}</p>
            <p className="text-2xl font-bold text-gray-900">{totalComponents}</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center">
          <div className="bg-orange-50 p-4 rounded-full mr-4">
            <AlertTriangle className="w-6 h-6 text-orange-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">{t('analytics.reworkRate', 'Nacharbeits-Quote')}</p>
            <p className="text-2xl font-bold text-gray-900">{reworkRate.toFixed(1)}%</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        
        {/* Order Types */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold mb-4 text-gray-800 flex items-center">
            <PieChartIcon className="w-5 h-5 mr-2 text-gray-400" />
            {t('analytics.orderTypes', 'Auftragsarten')}
          </h2>
          <div className="h-72">
            {typeData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={typeData} cx="50%" cy="50%" labelLine={false} label={({ name, percent }) => `${name} (${((percent || 0) * 100).toFixed(0)}%)`} outerRadius={90} dataKey="value">
                    {typeData.map((_entry, index) => <Cell key={`cell-${index}`} fill={TYPE_COLORS[index % TYPE_COLORS.length]} />)}
                  </Pie>
                  <RechartsTooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : <div className="h-full flex items-center justify-center text-gray-400">{t('analytics.noData', 'Keine Daten')}</div>}
          </div>
        </div>

        {/* Priorities */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold mb-4 text-gray-800 flex items-center">
            <AlertTriangle className="w-5 h-5 mr-2 text-gray-400" />
            {t('analytics.priorities', 'Prioritäten')}
          </h2>
          <div className="h-72">
            {priorityData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={priorityData} cx="50%" cy="50%" labelLine={false} label={({ name, percent }) => `${name} (${((percent || 0) * 100).toFixed(0)}%)`} outerRadius={90} dataKey="value">
                    {priorityData.map((entry, index) => <Cell key={`cell-${index}`} fill={(PRIO_COLORS as any)[entry.name] || COLORS[index]} />)}
                  </Pie>
                  <RechartsTooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : <div className="h-full flex items-center justify-center text-gray-400">{t('analytics.noData', 'Keine Daten')}</div>}
          </div>
        </div>

        {/* Top Clients */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold mb-4 text-gray-800 flex items-center">
            <TrendingUp className="w-5 h-5 mr-2 text-gray-400" />
            {t('analytics.topClients', 'Top Auftraggeber (Anzahl Aufträge)')}
          </h2>
          <div className="h-72">
            {clientData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={clientData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#E5E7EB" />
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="name" width={100} tick={{fontSize: 12}} />
                  <RechartsTooltip cursor={{fill: '#F3F4F6'}} />
                  <Bar dataKey="value" fill="#3B82F6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <div className="h-full flex items-center justify-center text-gray-400">{t('analytics.noData', 'Keine Daten')}</div>}
          </div>
        </div>

        {/* Top Cost Centers */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold mb-4 text-gray-800 flex items-center">
            <TrendingUp className="w-5 h-5 mr-2 text-gray-400" />
            {t('analytics.topCostCenters', 'Top Kostenstellen')}
          </h2>
          <div className="h-72">
            {costCenterData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={costCenterData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                  <XAxis dataKey="name" tick={{fontSize: 12}} />
                  <YAxis />
                  <RechartsTooltip cursor={{fill: '#F3F4F6'}} />
                  <Bar dataKey="value" fill="#10B981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <div className="h-full flex items-center justify-center text-gray-400">{t('analytics.noData', 'Keine Daten')}</div>}
          </div>
        </div>
      </div>

      {/* Mitarbeiter & Performance */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-8">
        <h2 className="text-xl font-bold mb-6 text-gray-900 flex items-center border-b pb-4">
          <Clock className="w-6 h-6 mr-2 text-gray-500" />
          {t('analytics.employeePerformance', 'Mitarbeiter Performance & Zeit-Tracking')}
        </h2>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Completed Subtasks */}
          <div>
            <h3 className="text-md font-semibold mb-4 text-gray-700">{t('analytics.completedSubtasks', 'Erledigte Unteraufgaben')}</h3>
            <div className="h-64">
              {employeeData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={employeeData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <RechartsTooltip />
                    <Bar dataKey="completed" fill="#6366F1" name={t('analytics.completed', 'Abgeschlossen')} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <div className="h-full flex items-center justify-center text-gray-400">{t('analytics.noData', 'Keine Daten')}</div>}
            </div>
          </div>

          {/* Time Tracking Comparison */}
          <div>
            <h3 className="text-md font-semibold mb-4 text-gray-700">{t('analytics.timeTracking', 'Geschätzte vs. Reale Zeit (Std)')}</h3>
            <div className="h-64">
              {employeeData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={employeeData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <RechartsTooltip />
                    <Legend />
                    <Bar dataKey="estimatedHours" fill="#93C5FD" name={t('analytics.estimated', 'Geschätzt')} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="actualHours" fill="#3B82F6" name={t('analytics.actual', 'Tatsächlich')} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <div className="h-full flex items-center justify-center text-gray-400">{t('analytics.noData', 'Keine Daten')}</div>}
            </div>
          </div>
        </div>

        {/* Estimation Accuracy Table */}
        <div>
          <h3 className="text-md font-semibold mb-4 text-gray-700">{t('analytics.estimationAccuracy', 'Planungsgenauigkeit (Verschätzung)')}</h3>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="bg-gray-50 text-gray-700">
                <tr>
                  <th className="px-4 py-3">{t('analytics.employee', 'Mitarbeiter')}</th>
                  <th className="px-4 py-3">{t('analytics.estimatedTotal', 'Geschätzt (Σ)')}</th>
                  <th className="px-4 py-3">{t('analytics.actualTotal', 'Tatsächlich (Σ)')}</th>
                  <th className="px-4 py-3">{t('analytics.diffAbs', 'Differenz (Std)')}</th>
                  <th className="px-4 py-3">{t('analytics.diffPerc', 'Abweichung (%)')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {employeeData.map((emp, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{emp.name}</td>
                    <td className="px-4 py-3">{emp.estimatedHours}h</td>
                    <td className="px-4 py-3">{emp.actualHours}h</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${emp.diff > 0 ? 'bg-red-100 text-red-700' : emp.diff < 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                        {emp.diff > 0 ? '+' : ''}{emp.diff}h
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`font-medium ${emp.percentageOff > 0 ? 'text-red-600' : emp.percentageOff < 0 ? 'text-green-600' : 'text-gray-600'}`}>
                        {emp.percentageOff > 0 ? '+' : ''}{emp.percentageOff}%
                      </span>
                    </td>
                  </tr>
                ))}
                {employeeData.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-400">{t('analytics.noData', 'Keine Daten')}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      
      {/* On Time Delivery */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold mb-4 text-gray-800 flex items-center">
            <CheckCircle2 className="w-5 h-5 mr-2 text-gray-400" />
            {t('analytics.onTimeDelivery', 'Pünktlichkeit (Abgeschlossene Aufträge)')}
          </h2>
          <div className="h-72 flex justify-center">
            {onTimeData.length > 0 ? (
              <ResponsiveContainer width="50%" height="100%">
                <PieChart>
                  <Pie data={onTimeData} cx="50%" cy="50%" labelLine={false} label={({ name, percent }) => `${name} (${((percent || 0) * 100).toFixed(0)}%)`} outerRadius={90} dataKey="value">
                    {onTimeData.map((_entry, index) => <Cell key={`cell-${index}`} fill={ONTIME_COLORS[index % ONTIME_COLORS.length]} />)}
                  </Pie>
                  <RechartsTooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : <div className="h-full flex items-center justify-center text-gray-400">{t('analytics.noData', 'Keine Daten')}</div>}
          </div>
        </div>
        
    </div>
  );
}
