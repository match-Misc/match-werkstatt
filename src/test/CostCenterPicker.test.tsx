import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CostCenterPicker from '../components/CostCenterPicker';

const costCenters = [
  { id: '1', number: 'K-001', projectName: 'Projekt A' },
  { id: '2', number: 'K-002', projectName: 'Projekt A' },
  { id: '3', number: 'K-003', projectName: 'Projekt B' }
];

afterEach(() => vi.unstubAllGlobals());

describe('CostCenterPicker', () => {
  it('shows each project name once without cost center numbers', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => costCenters }));

    render(<CostCenterPicker id="projectName" field="projectName" value="" onChange={vi.fn()} />);

    const select = await screen.findByRole('combobox');
    await waitFor(() => expect(select).not.toBeDisabled());
    expect(within(select).getAllByRole('option')).toHaveLength(3);
    expect(within(select).getByRole('option', { name: 'Projekt A' })).toBeInTheDocument();
    expect(within(select).getByRole('option', { name: 'Projekt B' })).toBeInTheDocument();
    expect(within(select).queryByText(/K-00/)).not.toBeInTheDocument();
  });

  it('creates a cost center and selects its project name from the shared dialog', async () => {
    const created = { id: '4', number: 'K-004', projectName: 'Projekt C' };
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => costCenters })
      .mockResolvedValueOnce({ ok: true, json: async () => created });
    vi.stubGlobal('fetch', fetchMock);
    const onChange = vi.fn();
    const onCreated = vi.fn();
    const user = userEvent.setup();

    render(<CostCenterPicker field="projectName" value="" onChange={onChange} onCreated={onCreated} />);
    await waitFor(() => expect(screen.getByRole('combobox')).not.toBeDisabled());
    await user.click(screen.getByTitle('Neues Projekt'));
    await user.type(screen.getByPlaceholderText('z.B. KOSTEN-001'), created.number);
    await user.type(screen.getByPlaceholderText('z.B. Projekt X'), created.projectName);
    await user.click(screen.getByRole('button', { name: 'Anlegen & Auswählen' }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(created.projectName));
    expect(onCreated).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenLastCalledWith('/api/cost-centers', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ number: created.number, projectName: created.projectName })
    }));
  });
});
