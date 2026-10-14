import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OrderedTableRow, orderColumnsByPreference } from '../components/ColumnConfigDropdown';

vi.mock('../context/AppContext', () => ({ useApp: () => ({ state: { currentUser: {
  tableConfig: { test_hidden: false }, tableColumnOrder: { test: ['title', 'number'] }
} } }) }));

describe('Persönliche Tabellenspalten', () => {
  it('ignoriert veraltete und doppelte IDs und ergänzt neue Spalten', () => {
    const columns = [{ id: 'number' }, { id: 'title' }, { id: 'new' }];
    expect(orderColumnsByPreference(columns, ['title', 'old', 'title'])).toEqual([columns[1], columns[0], columns[2]]);
  });
  it('ordnet Kopf und Daten gleich an und entfernt ausgeblendete Zellen', () => {
    render(<table><thead><OrderedTableRow tableId="test">
      <th data-column="number">Nummer</th><th data-column="title">Titel</th><th data-column="hidden">Intern</th>
    </OrderedTableRow></thead><tbody><OrderedTableRow tableId="test">
      <td data-column="number">123</td><td data-column="title">Auftrag</td><td data-column="hidden">Geheim</td>
    </OrderedTableRow></tbody></table>);
    expect(screen.getAllByRole('columnheader').map(cell => cell.textContent)).toEqual(['Titel', 'Nummer']);
    expect(screen.getAllByRole('cell').map(cell => cell.textContent)).toEqual(['Auftrag', '123']);
    expect(screen.queryByText('Geheim')).not.toBeInTheDocument();
  });
});
