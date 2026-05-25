import { describe, it, expect } from 'vitest';
import { escapeCsvCell, rowsToCsv } from './route';
import type { MemberRow } from '@/components/members/members-table';

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

describe('escapeCsvCell', () => {
  it('returns empty string for null or undefined', () => {
    expect(escapeCsvCell(null)).toBe('');
    expect(escapeCsvCell(undefined)).toBe('');
  });

  it('passes plain ASCII values through', () => {
    expect(escapeCsvCell('hello')).toBe('hello');
    expect(escapeCsvCell(42)).toBe('42');
  });

  it('quotes values containing commas', () => {
    expect(escapeCsvCell('Acme, Inc.')).toBe('"Acme, Inc."');
  });

  it('escapes double quotes and wraps in quotes', () => {
    expect(escapeCsvCell('He said "hi"')).toBe('"He said ""hi"""');
  });

  it('quotes values containing newlines', () => {
    expect(escapeCsvCell('line1\nline2')).toBe('"line1\nline2"');
  });
});

describe('rowsToCsv', () => {
  it('produces header-only output for empty rows', () => {
    const csv = rowsToCsv([]);
    expect(csv.startsWith('member_id,source_kind,email,name,effective_role')).toBe(true);
    expect(csv.trim().split(/\r?\n/)).toHaveLength(1);
  });

  it('includes one row per member with escaped values', () => {
    const csv = rowsToCsv([
      makeRow({ name: 'Alice, Martin', email: 'alice@example.com' }),
    ]);
    const lines = csv.trim().split(/\r?\n/);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('u-1,membre,alice@example.com,"Alice, Martin"');
  });

  it('exports the new sources (invite + responsible + org_lead) with their labels', () => {
    const csv = rowsToCsv([
      makeRow({
        id: 'invite:abc',
        source_kind: 'invite',
        email: 'pending@example.com',
        name: null,
        status: 'invited',
      }),
      makeRow({
        id: 'responsible:xyz',
        source_kind: 'responsible',
        email: 'lead@example.com',
        status: 'external_contact',
      }),
      makeRow({
        id: 'org_lead:def',
        source_kind: 'org_lead',
        email: 'legacy@example.com',
        status: 'external_contact',
      }),
    ]);
    expect(csv).toContain('invite:abc,invitation,pending@example.com');
    expect(csv).toContain('Invité');
    expect(csv).toContain('responsible:xyz,responsable_externe,lead@example.com');
    expect(csv).toContain('org_lead:def,responsable_legacy,legacy@example.com');
    expect(csv).toContain('Externe');
  });

  it('maps role_source kinds to kind + label columns', () => {
    const csv = rowsToCsv([
      makeRow({ id: 'u-g', role_source: { kind: 'group', name: 'Acme' } }),
      makeRow({ id: 'u-t', role_source: { kind: 'team', name: 'Beta' } }),
      makeRow({ id: 'u-d', role_source: { kind: 'direct' } }),
    ]);
    expect(csv).toContain(',group,Acme,');
    expect(csv).toContain(',team,Beta,');
    expect(csv).toContain(',direct,,');
  });

  it('localises role and status labels', () => {
    const csv = rowsToCsv([
      makeRow({ effective_role: 'admin', status: 'inactive', inactive_days: 42 }),
    ]);
    expect(csv).toContain('Admin');
    expect(csv).toContain('Inactif');
    expect(csv).toContain(',42,');
  });

  it('serialises booleans as yes/no', () => {
    const csv = rowsToCsv([makeRow({ can_edit_role: true, can_remove: false })]);
    const body = csv.trim().split(/\r?\n/)[1]!;
    const cells = body.split(',');
    expect(cells.at(-2)).toBe('yes');
    expect(cells.at(-1)).toBe('no');
  });
});
