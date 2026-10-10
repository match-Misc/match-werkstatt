import { Order, SubTask } from '../types';

interface OrderProgressProps {
  status: Order['status'];
  subTasks?: SubTask[];
}

function getCurrentStep(status: Order['status'], subTasks: SubTask[]) {
  switch (status) {
    case 'Entwurf': return 'Warten auf Einreichung';
    case 'pending': return 'Warten auf Annahme';
    case 'accepted': return 'Warten auf Auftragsstart';
    case 'revision': return 'Warten auf Überarbeitung';
    case 'rework': return 'Warten auf Nacharbeit';
    case 'waiting_confirmation': return 'Warten auf Abnahme';
    case 'completed': return 'Auftrag abgeschlossen';
    case 'archived': return 'Auftrag archiviert';
    case 'in_progress':
      if (subTasks.length > 0 && subTasks.every(task => task.status === 'completed')) {
        return 'Warten auf Freigabe zur Abnahme';
      }
      return subTasks.some(task => task.status === 'in_progress')
        ? 'Bearbeitung läuft'
        : subTasks.length > 0 ? 'Warten auf Bearbeitung' : 'Auftrag in Bearbeitung';
  }
}

function getProgress(status: Order['status'], subTasks: SubTask[], completed: number) {
  switch (status) {
    case 'Entwurf':
    case 'pending':
    case 'revision':
      return 0;
    case 'accepted':
      return 10;
    case 'in_progress':
    case 'rework':
      return 20 + (subTasks.length ? Math.round((completed / subTasks.length) * 60) : 0);
    case 'waiting_confirmation':
      return 90;
    case 'completed':
    case 'archived':
      return 100;
  }
}

export default function OrderProgress({ status, subTasks = [] }: OrderProgressProps) {
  const completed = subTasks.filter(task => task.status === 'completed').length;
  const inProgress = subTasks.filter(task => task.status === 'in_progress').length;
  const percent = getProgress(status, subTasks, completed);
  const currentStep = getCurrentStep(status, subTasks);

  return (
    <div className="flex items-center gap-4 border-b border-gray-200 px-6 py-4">
      <span className="shrink-0 text-sm font-semibold text-gray-800">Fortschritt</span>
      <div
        role="progressbar"
        aria-label="Auftragsfortschritt"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`${currentStep}, ${completed} von ${subTasks.length} Unteraufgaben abgeschlossen${inProgress ? `, ${inProgress} in Bearbeitung` : ''}`}
        className="relative h-7 min-w-0 flex-1 overflow-hidden rounded-full bg-gray-200"
      >
        <div className="h-full rounded-full bg-blue-400 transition-all duration-300" style={{ width: `${percent}%` }} />
        <div className="absolute inset-0 flex items-center justify-center px-2">
          <span title={currentStep} className="max-w-full truncate text-xs font-medium text-gray-800">
            {currentStep}
          </span>
        </div>
      </div>
      <span className="w-12 shrink-0 text-right text-xs font-medium text-gray-600">{percent} %</span>
    </div>
  );
}
