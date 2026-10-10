import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import OrderProgress from '../components/OrderProgress';
import { Order, SubTask } from '../types';

describe('OrderProgress', () => {
  it('shows the percentage beside the bar and keeps task counts accessible', () => {
    const subTasks = [
      { status: 'completed' },
      { status: 'in_progress' },
      { status: 'pending' }
    ] as SubTask[];

    render(<OrderProgress status="in_progress" subTasks={subTasks} />);

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', 'Bearbeitung läuft, 1 von 3 Unteraufgaben abgeschlossen, 1 in Bearbeitung');
    expect(screen.getByText('40 %')).toBeInTheDocument();
    expect(screen.getByText('Bearbeitung läuft').closest('[role="progressbar"]')).toBe(screen.getByRole('progressbar'));
    expect(screen.queryByText(/1 von 3 Unteraufgaben abgeschlossen/)).not.toBeInTheDocument();
  });

  it('shows zero percent when no subtasks exist', () => {
    render(<OrderProgress status="pending" />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    expect(screen.getByText('0 %')).toBeInTheDocument();
    expect(screen.getByText('Warten auf Annahme')).toBeInTheDocument();
  });

  it.each([
    ['Entwurf', 0],
    ['pending', 0],
    ['revision', 0],
    ['accepted', 10],
    ['in_progress', 20],
    ['rework', 20],
    ['waiting_confirmation', 90],
    ['completed', 100],
    ['archived', 100]
  ] as Array<[Order['status'], number]>)('includes the %s stage in progress', (status, percent) => {
    render(<OrderProgress status={status} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', String(percent));
    expect(screen.getByText(`${percent} %`)).toBeInTheDocument();
  });

  it('scales completed subtasks between order start and final approval', () => {
    const pendingTask = { status: 'pending' } as SubTask;
    const completedTask = { status: 'completed' } as SubTask;
    const { rerender } = render(<OrderProgress status="in_progress" subTasks={[pendingTask, pendingTask]} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '20');

    rerender(<OrderProgress status="in_progress" subTasks={[completedTask, pendingTask]} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');

    rerender(<OrderProgress status="in_progress" subTasks={[completedTask, completedTask]} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '80');
  });

  it.each([
    ['accepted', 'Warten auf Auftragsstart'],
    ['revision', 'Warten auf Überarbeitung'],
    ['rework', 'Warten auf Nacharbeit'],
    ['waiting_confirmation', 'Warten auf Abnahme'],
    ['completed', 'Auftrag abgeschlossen']
  ] as Array<[Order['status'], string]>)('shows the current step for %s', (status, step) => {
    render(<OrderProgress status={status} />);
    expect(screen.getByText(step)).toBeInTheDocument();
  });

  it('distinguishes waiting for work from waiting for acceptance release', () => {
    const pendingTask = { status: 'pending' } as SubTask;
    const { rerender } = render(<OrderProgress status="in_progress" subTasks={[pendingTask]} />);
    expect(screen.getByText('Warten auf Bearbeitung')).toBeInTheDocument();

    rerender(<OrderProgress status="in_progress" subTasks={[{ status: 'completed' } as SubTask]} />);
    expect(screen.getByText('Warten auf Freigabe zur Abnahme')).toBeInTheDocument();
  });
});
