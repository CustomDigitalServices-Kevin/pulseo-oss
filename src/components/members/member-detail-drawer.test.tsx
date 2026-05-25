import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemberDetailDrawer, type MemberDetail } from './member-detail-drawer';

function makeDetail(overrides: Partial<MemberDetail> = {}): MemberDetail {
  return {
    user: { id: 'u-1', name: 'Alice Martin', email: 'alice@example.com' },
    effectiveRole: 'gestionnaire',
    primarySource: { kind: 'direct' },
    roleSources: [
      { kind: 'direct', role: 'gestionnaire', since: '2025-11-12T10:00:00Z' },
    ],
    kpis: {
      ticketsCreated30d: 8,
      commentsPosted30d: 24,
      medianResponseMinutes: 45,
    },
    sparkline: [
      { date: '2026-04-01', count: 2 },
      { date: '2026-04-02', count: 3 },
      { date: '2026-04-03', count: 1 },
      { date: '2026-04-04', count: 5 },
    ],
    heatmap: [
      { day_of_week: 1, hour: 9, count: 5 },
      { day_of_week: 3, hour: 14, count: 12 },
    ],
    timeline: [
      {
        id: 'e-1',
        event_type: 'ticket_created',
        resource_id: 't-1',
        created_at: '2026-04-18T09:30:00Z',
      },
      {
        id: 'e-2',
        event_type: 'login',
        resource_id: null,
        created_at: '2026-04-18T08:00:00Z',
      },
    ],
    ...overrides,
  };
}

// With the next-intl mock, t('key', params) echoes the literal key (with
// `{param}` tokens replaced). Keys like "roleGestionnaire", "drawerDirect",
// "drawerNoActivity" are returned verbatim — so we assert on those.

describe('<MemberDetailDrawer />', () => {
  it('renders nothing when detail is null', () => {
    const { container } = render(<MemberDetailDrawer detail={null} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders user header with effective role and primary pill', () => {
    render(<MemberDetailDrawer detail={makeDetail()} onClose={() => {}} />);
    expect(screen.getByText('Alice Martin')).toBeInTheDocument();
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    // Effective role rendered via t('roleGestionnaire') → echoes key.
    expect(screen.getAllByText('roleGestionnaire').length).toBeGreaterThanOrEqual(1);
    // Primary pill for direct source: t('drawerDirect') → "drawerDirect".
    expect(screen.getByText('drawerDirect')).toBeInTheDocument();
  });

  it('renders KPI tiles with values', () => {
    render(<MemberDetailDrawer detail={makeDetail()} onClose={() => {}} />);
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('24')).toBeInTheDocument();
    // formatMinutes builds `${n} ${labels.minutesShort}` → labels.minutesShort
    // is the echoed key "drawerMinutesShort".
    expect(screen.getByText('45 drawerMinutesShort')).toBeInTheDocument();
  });

  it('renders timeline events with translated labels', () => {
    render(<MemberDetailDrawer detail={makeDetail()} onClose={() => {}} />);
    // Event labels go through t('eventTicketCreated') / t('eventLogin').
    expect(screen.getByText('eventTicketCreated')).toBeInTheDocument();
    expect(screen.getByText('eventLogin')).toBeInTheDocument();
  });

  it('renders role source explanation for all kinds', () => {
    const detail = makeDetail({
      roleSources: [
        { kind: 'direct', role: 'viewer', since: '2025-10-01T00:00:00Z' },
        {
          kind: 'group_manager',
          groupId: 'g-1',
          groupName: 'Acme',
          since: '2025-11-01T00:00:00Z',
        },
        {
          kind: 'team_grant',
          teamId: 't-1',
          teamName: 'Beta',
          role: 'admin',
          since: '2025-12-01T00:00:00Z',
        },
      ],
    });
    render(<MemberDetailDrawer detail={detail} onClose={() => {}} />);
    // direct → t('drawerRoleDirectMembership') echoed verbatim.
    expect(screen.getByText('drawerRoleDirectMembership')).toBeInTheDocument();
    // group_manager → t('drawerRoleGroupManager', { name: 'Acme' }) →
    // the key has no {name} token so we get "drawerRoleGroupManager" back.
    expect(screen.getByText('drawerRoleGroupManager')).toBeInTheDocument();
    // team_grant → t('drawerRoleGrantTeam', { name: 'Beta' }).
    expect(screen.getByText('drawerRoleGrantTeam')).toBeInTheDocument();
  });

  it('displays empty state for role sources when user has no access', () => {
    const detail = makeDetail({ effectiveRole: null, roleSources: [] });
    render(<MemberDetailDrawer detail={detail} onClose={() => {}} />);
    expect(screen.getByText('drawerNoAccessExplain')).toBeInTheDocument();
  });

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn();
    render(<MemberDetailDrawer detail={makeDetail()} onClose={onClose} />);
    // aria-label via t('drawerClose') → echoes key.
    fireEvent.click(screen.getByRole('button', { name: 'drawerClose' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when overlay backdrop clicked', () => {
    const onClose = vi.fn();
    const { baseElement } = render(<MemberDetailDrawer detail={makeDetail()} onClose={onClose} />);
    // Radix Sheet (base-ui Dialog) renders the overlay with data-slot="sheet-overlay"
    // in a Portal at document.body level. Clicking it triggers onOpenChange(false)
    // which our handler propagates to onClose.
    const overlay = baseElement.querySelector('[data-slot="sheet-overlay"]');
    expect(overlay).not.toBeNull();
    fireEvent.click(overlay!);
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose on Escape key (Radix handles natively, propagates to onOpenChange)', () => {
    const onClose = vi.fn();
    const { baseElement } = render(<MemberDetailDrawer detail={makeDetail()} onClose={onClose} />);
    // Radix Dialog attaches the Escape listener on the popup itself, not on window.
    const popup = baseElement.querySelector('[data-slot="sheet-content"]');
    expect(popup).not.toBeNull();
    fireEvent.keyDown(popup!, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('renders group primary pill when role is inherited via group', () => {
    const detail = makeDetail({
      primarySource: { kind: 'group', name: 'Acme' },
    });
    render(<MemberDetailDrawer detail={detail} onClose={() => {}} />);
    // t('provenanceViaGroup', { name: 'Acme' }) — the fr.json template is
    // "↳ via groupe {name}" but the mock echoes the KEY "provenanceViaGroup"
    // (no {name} token in the key itself).
    expect(screen.getByText('provenanceViaGroup')).toBeInTheDocument();
  });

  it('displays empty state for sparkline when no activity', () => {
    const detail = makeDetail({ sparkline: [] });
    render(<MemberDetailDrawer detail={detail} onClose={() => {}} />);
    expect(screen.getByText('drawerNoActivity')).toBeInTheDocument();
  });

  it('displays empty state for timeline when no events', () => {
    const detail = makeDetail({ timeline: [] });
    render(<MemberDetailDrawer detail={detail} onClose={() => {}} />);
    expect(screen.getByText('drawerNoEvents')).toBeInTheDocument();
  });
});
