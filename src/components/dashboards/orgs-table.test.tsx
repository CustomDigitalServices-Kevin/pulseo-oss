import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OrgsTable } from './orgs-table';
import type { TopOrgRow } from '@/lib/stats/aggregations';

const row: TopOrgRow = {
  organization_id: 'org-1',
  organization_slug: 'acme',
  organization_name: 'Acme',
  open_tickets: 7,
  overdue_tickets: 2,
  created_30d: 11,
};

describe('<OrgsTable />', () => {
  it('renders a row with counts and slug link', async () => {
    // OrgsTable is an async Server Component → await it to get the JSX tree,
    // then pass it through RTL's `render`. The next-intl mock stubs
    // `getTranslations` so the component resolves synchronously in tests.
    const ui = await OrgsTable({ rows: [row] });
    render(ui);
    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('11')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /Acme/i });
    expect(link).toHaveAttribute('href', '/clients/acme');
  });

  it('renders an empty state with the provided label', async () => {
    const ui = await OrgsTable({ rows: [], emptyLabel: 'Rien à afficher' });
    render(ui);
    expect(screen.getByText('Rien à afficher')).toBeInTheDocument();
  });

  it('renders a provenance pill when provenance is set', async () => {
    const rows = [{ ...row, provenance: 'group' as const }];
    const ui = await OrgsTable({ rows });
    render(ui);
    // next-intl mock echoes the `provenanceGroup` key.
    expect(screen.getByText('provenanceGroup')).toBeInTheDocument();
  });

  it('renders different pill labels for team vs direct', async () => {
    const ui = await OrgsTable({
      rows: [
        { ...row, organization_id: 'o2', organization_slug: 'a2', organization_name: 'Org B', provenance: 'team' },
        { ...row, organization_id: 'o3', organization_slug: 'a3', organization_name: 'Org C', provenance: 'direct' },
      ],
    });
    render(ui);
    expect(screen.getByText('provenanceTeam')).toBeInTheDocument();
    expect(screen.getByText('provenanceDirect')).toBeInTheDocument();
  });
});
