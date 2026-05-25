import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { MembersTable, type MemberRow } from './members-table';

function makeRow(overrides: Partial<MemberRow> = {}): MemberRow {
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
    tickets_created_30d: 12,
    tickets_commented_30d: 34,
    sparkline_30d: [0, 1, 2, 3, 2, 5, 4, 6, 8, 3, 2, 1, 4, 5, 2, 3, 7, 6, 5, 4, 3, 2, 1, 0, 2, 3, 4, 5, 6, 7],
    heatmap_7d: [2, 5, 3, 8, 4, 1, 0],
    median_response_minutes: 145,
    can_edit_role: true,
    can_remove: true,
    ...overrides,
  };
}

// With the next-intl mock, t('key', params) echoes the literal key (with
// `{param}` tokens replaced). Role labels / status labels / aria labels are
// all just the key names when the key contains no `{...}` token.

describe('<MembersTable />', () => {
  const baseScope = { type: 'org' as const, id: 'org-1' };
  const baseActor = { role: 'admin' as const, isSuperadmin: false };

  it('renders member rows with role label and counts', () => {
    render(
      <MembersTable
        members={[makeRow()]}
        scope={baseScope}
        actor={baseActor}
      />,
    );

    expect(screen.getByText('Alice Martin')).toBeInTheDocument();
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    expect(screen.getByText('roleGestionnaire')).toBeInTheDocument();
    expect(screen.getByText('statusActive')).toBeInTheDocument();

    const row = screen.getByText('Alice Martin').closest('tr');
    expect(row).not.toBeNull();
    expect(within(row!).getByText('12')).toBeInTheDocument();
    expect(within(row!).getByText('34')).toBeInTheDocument();
  });

  it('renders provenance pill when role is inherited via group', () => {
    render(
      <MembersTable
        members={[
          makeRow({
            role_source: { kind: 'group', name: 'Acme' },
            can_edit_role: false,
            can_remove: false,
          }),
        ]}
        scope={baseScope}
        actor={baseActor}
      />,
    );

    expect(screen.getByText('provenanceViaGroup')).toBeInTheDocument();
  });

  it('filters by search text (email and name)', () => {
    render(
      <MembersTable
        members={[
          makeRow({ id: 'u-1', email: 'alice@acme.fr', name: 'Alice Martin' }),
          makeRow({ id: 'u-2', email: 'bob@contoso.fr', name: 'Bob Durand' }),
        ]}
        scope={baseScope}
        actor={baseActor}
      />,
    );

    expect(screen.getByText('Alice Martin')).toBeInTheDocument();
    expect(screen.getByText('Bob Durand')).toBeInTheDocument();

    const searchbox = screen.getByRole('searchbox', { name: 'searchAria' });
    fireEvent.change(searchbox, { target: { value: 'bob' } });

    expect(screen.queryByText('Alice Martin')).not.toBeInTheDocument();
    expect(screen.getByText('Bob Durand')).toBeInTheDocument();
  });

  it('filters by role segment', () => {
    render(
      <MembersTable
        members={[
          makeRow({ id: 'u-1', name: 'Alice Admin', effective_role: 'admin' }),
          makeRow({ id: 'u-2', name: 'Bob Viewer', effective_role: 'viewer' }),
        ]}
        scope={baseScope}
        actor={baseActor}
      />,
    );

    expect(screen.getByText('Alice Admin')).toBeInTheDocument();
    expect(screen.getByText('Bob Viewer')).toBeInTheDocument();

    // Role segment button uses t('filterAdmin') → "filterAdmin".
    fireEvent.click(screen.getByRole('button', { name: 'filterAdmin', pressed: false }));

    expect(screen.getByText('Alice Admin')).toBeInTheDocument();
    expect(screen.queryByText('Bob Viewer')).not.toBeInTheDocument();
  });

  it('filters by provenance segment (group)', () => {
    render(
      <MembersTable
        members={[
          makeRow({ id: 'u-1', name: 'Direct Alice', role_source: { kind: 'direct' } }),
          makeRow({
            id: 'u-2',
            name: 'Group Bob',
            role_source: { kind: 'group', name: 'Acme' },
          }),
        ]}
        scope={baseScope}
        actor={baseActor}
      />,
    );

    expect(screen.getByText('Direct Alice')).toBeInTheDocument();
    expect(screen.getByText('Group Bob')).toBeInTheDocument();

    // Provenance "via group" segment → t('filterViaGroup') → "filterViaGroup".
    fireEvent.click(screen.getByRole('button', { name: 'filterViaGroup', pressed: false }));

    expect(screen.queryByText('Direct Alice')).not.toBeInTheDocument();
    expect(screen.getByText('Group Bob')).toBeInTheDocument();
  });

  it('disables edit and remove buttons when permissions are false', () => {
    render(
      <MembersTable
        members={[
          makeRow({
            role_source: { kind: 'group', name: 'Acme' },
            can_edit_role: false,
            can_remove: false,
          }),
        ]}
        scope={baseScope}
        actor={baseActor}
      />,
    );

    // aria-label via t('editRoleFor', { name }) → key "editRoleFor" echoed.
    const editBtn = screen.getByRole('button', { name: 'editRoleFor' });
    const removeBtn = screen.getByRole('button', { name: 'removeAria' });

    expect(editBtn).toBeDisabled();
    expect(removeBtn).toBeDisabled();
    // title via t('tooltipInheritedGroup', { name: 'Acme' }) → key "tooltipInheritedGroup".
    expect(editBtn).toHaveAttribute('title', expect.stringContaining('tooltipInheritedGroup'));
  });

  it('fires callbacks on edit/remove/detail clicks', () => {
    const onEditRole = vi.fn();
    const onRemove = vi.fn();
    const onOpenDetail = vi.fn();

    render(
      <MembersTable
        members={[makeRow({ id: 'u-1' })]}
        scope={baseScope}
        actor={baseActor}
        onEditRole={onEditRole}
        onRemove={onRemove}
        onOpenDetail={onOpenDetail}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'editRoleFor' }));
    expect(onEditRole).toHaveBeenCalledWith('u-1');
    expect(onOpenDetail).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'removeAria' }));
    expect(onRemove).toHaveBeenCalledWith('u-1');

    fireEvent.click(screen.getByText('Alice Martin'));
    expect(onOpenDetail).toHaveBeenCalledWith('u-1');
  });

  it('shows "Ajouter un membre" button only when onAddMember is provided', () => {
    const { rerender } = render(
      <MembersTable members={[makeRow()]} scope={baseScope} actor={baseActor} />,
    );
    expect(screen.queryByRole('button', { name: 'addMember' })).not.toBeInTheDocument();

    rerender(
      <MembersTable
        members={[makeRow()]}
        scope={baseScope}
        actor={baseActor}
        onAddMember={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'addMember' })).toBeInTheDocument();
  });

  it('renders empty state when no members match', () => {
    render(
      <MembersTable
        members={[makeRow({ name: 'Alice' })]}
        scope={baseScope}
        actor={baseActor}
      />,
    );

    const searchbox = screen.getByRole('searchbox', { name: 'searchAria' });
    fireEvent.change(searchbox, { target: { value: 'zzzzz' } });
    expect(screen.getByText('tableEmpty')).toBeInTheDocument();
  });

  it('renders invited and inactive status badges', () => {
    render(
      <MembersTable
        members={[
          makeRow({ id: 'u-1', name: 'Alice Invited', status: 'invited' }),
          makeRow({ id: 'u-2', name: 'Bob Inactive', status: 'inactive', inactive_days: 42 }),
        ]}
        scope={baseScope}
        actor={baseActor}
      />,
    );

    expect(screen.getByText('statusInvited')).toBeInTheDocument();
    // statusInactiveWithDays has a `{days}` token → the mock replaces it.
    expect(screen.getByText('statusInactiveWithDays')).toBeInTheDocument();
  });

  it('formats median response time in minutes / hours / days', () => {
    render(
      <MembersTable
        members={[
          makeRow({ id: 'u-1', name: 'Fast', median_response_minutes: 35 }),
          makeRow({ id: 'u-2', name: 'Slow', median_response_minutes: 180 }),
          makeRow({ id: 'u-3', name: 'Snail', median_response_minutes: 60 * 48 }),
          makeRow({ id: 'u-4', name: 'Unknown', median_response_minutes: null }),
        ]}
        scope={baseScope}
        actor={baseActor}
      />,
    );

    // formatMinutes outputs `${n} ${labels.xxxShort}` where labels come from
    // the echoed keys: drawerMinutesShort / drawerHoursShort / drawerDaysShort.
    expect(screen.getByText('35 drawerMinutesShort')).toBeInTheDocument();
    expect(screen.getByText('3.0 drawerHoursShort')).toBeInTheDocument();
    expect(screen.getByText('2.0 drawerDaysShort')).toBeInTheDocument();
  });
});
