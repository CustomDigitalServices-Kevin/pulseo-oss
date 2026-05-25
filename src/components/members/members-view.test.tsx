import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MembersView } from './members-view';
import type { MemberRow } from './members-table';
import type { MemberDetail } from './member-detail-drawer';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function makeMember(overrides: Partial<MemberRow> = {}): MemberRow {
  return {
    id: 'u-1',
    source_kind: 'member',
    email: 'alice@example.com',
    name: 'Alice Martin',
    date_added: '2025-11-12T10:00:00Z',
    effective_role: 'gestionnaire',
    role_source: { kind: 'direct' },
    status: 'active',
    inactive_days: null,
    last_activity_at: '2026-04-18T08:00:00Z',
    tickets_created_30d: 4,
    tickets_commented_30d: 9,
    sparkline_30d: new Array(30).fill(0),
    heatmap_7d: [0, 0, 0, 0, 0, 0, 0],
    median_response_minutes: 60,
    can_edit_role: true,
    can_remove: true,
    ...overrides,
  };
}

function makeDetail(id: string): MemberDetail {
  return {
    user: { id, name: 'Alice Martin', email: 'alice@example.com' },
    effectiveRole: 'gestionnaire',
    primarySource: { kind: 'direct' },
    roleSources: [
      { kind: 'direct', role: 'gestionnaire', since: '2025-11-12T00:00:00Z' },
    ],
    kpis: {
      ticketsCreated30d: 4,
      commentsPosted30d: 9,
      medianResponseMinutes: 60,
    },
    sparkline: [],
    heatmap: [],
    timeline: [],
  };
}

describe('<MembersView />', () => {
  const scope = { type: 'org' as const, id: 'org-1' };
  const actor = { role: 'admin' as const, isSuperadmin: false };

  it('loads member detail via loadDetail when row clicked', async () => {
    const loadDetail = vi.fn(async (id: string) => makeDetail(id));

    render(
      <MembersView
        members={[makeMember()]}
        scope={scope}
        actor={actor}
        loadDetail={loadDetail}
      />,
    );

    fireEvent.click(screen.getByText('Alice Martin'));
    await waitFor(() => expect(loadDetail).toHaveBeenCalledWith('u-1'));
    await waitFor(() => {
      // Drawer open — confirm by title
      const all = screen.getAllByText('Alice Martin');
      expect(all.length).toBeGreaterThanOrEqual(2); // table row + drawer header
    });
  });

  it('shows Add Member button only when submitAddDirect is provided', () => {
    const { rerender } = render(
      <MembersView
        members={[makeMember()]}
        scope={scope}
        actor={actor}
        loadDetail={vi.fn()}
      />,
    );
    // next-intl mock echoes the i18n key "addMember".
    expect(screen.queryByRole('button', { name: 'addMember' })).not.toBeInTheDocument();

    rerender(
      <MembersView
        members={[makeMember()]}
        scope={scope}
        actor={actor}
        loadDetail={vi.fn()}
        submitAddDirect={vi.fn().mockResolvedValue({ ok: true })}
      />,
    );
    expect(screen.getByRole('button', { name: 'addMember' })).toBeInTheDocument();
  });

  it('shows error toast when loadDetail rejects', async () => {
    const sonner = await import('sonner');
    const loadDetail = vi.fn().mockRejectedValue(new Error('Boom'));

    render(
      <MembersView
        members={[makeMember()]}
        scope={scope}
        actor={actor}
        loadDetail={loadDetail}
      />,
    );

    fireEvent.click(screen.getByText('Alice Martin'));
    await waitFor(() => expect(sonner.toast.error).toHaveBeenCalledWith('Boom'));
  });
});
