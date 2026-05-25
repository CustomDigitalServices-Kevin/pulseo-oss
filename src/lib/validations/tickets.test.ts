import { describe, it, expect } from 'vitest';
import {
  createTicketSchema,
  updateTicketSchema,
  updateTicketStatusSchema,
  assignContractSchema,
  updateTimeSpentSchema,
} from './tickets';

const validUuid = '550e8400-e29b-41d4-a716-446655440000';

describe('createTicketSchema', () => {
  const baseValid = {
    title: 'Bug critique sur le portail',
    description: 'Le bouton de connexion ne fonctionne pas en production',
    priority: 'high' as const,
    category: 'bug' as const,
    organization_id: validUuid,
  };

  it('accepts a fully valid ticket', () => {
    expect(createTicketSchema.safeParse(baseValid).success).toBe(true);
  });

  it('rejects title shorter than 3 characters', () => {
    const result = createTicketSchema.safeParse({ ...baseValid, title: 'ab' });
    expect(result.success).toBe(false);
  });

  it('rejects title longer than 200 characters', () => {
    const result = createTicketSchema.safeParse({
      ...baseValid,
      title: 'a'.repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it('rejects description shorter than 10 characters', () => {
    const result = createTicketSchema.safeParse({
      ...baseValid,
      description: 'court',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid priority', () => {
    const result = createTicketSchema.safeParse({
      ...baseValid,
      priority: 'urgent',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid category', () => {
    const result = createTicketSchema.safeParse({
      ...baseValid,
      category: 'random',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid UUID for organization_id', () => {
    const result = createTicketSchema.safeParse({
      ...baseValid,
      organization_id: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('accepts optional contract_id when valid UUID', () => {
    const result = createTicketSchema.safeParse({
      ...baseValid,
      contract_id: validUuid,
    });
    expect(result.success).toBe(true);
  });

  it('accepts the 4 valid priorities', () => {
    for (const p of ['low', 'medium', 'high', 'critical'] as const) {
      expect(
        createTicketSchema.safeParse({ ...baseValid, priority: p }).success
      ).toBe(true);
    }
  });

  it('accepts the 4 valid categories', () => {
    for (const c of ['bug', 'feature', 'support', 'maintenance'] as const) {
      expect(
        createTicketSchema.safeParse({ ...baseValid, category: c }).success
      ).toBe(true);
    }
  });
});

describe('updateTicketSchema', () => {
  it('accepts empty object (all fields optional)', () => {
    expect(updateTicketSchema.safeParse({}).success).toBe(true);
  });

  it('accepts partial updates', () => {
    expect(
      updateTicketSchema.safeParse({ title: 'Nouveau titre' }).success
    ).toBe(true);
  });

  it('rejects too short title even when only updating title', () => {
    expect(updateTicketSchema.safeParse({ title: 'ab' }).success).toBe(false);
  });

  it('accepts null contract_id (unlinking)', () => {
    expect(
      updateTicketSchema.safeParse({ contract_id: null }).success
    ).toBe(true);
  });
});

describe('updateTicketStatusSchema', () => {
  it('accepts each valid status', () => {
    for (const s of ['new', 'in_progress', 'waiting_client', 'resolved', 'closed'] as const) {
      expect(
        updateTicketStatusSchema.safeParse({
          status: s,
          ticket_id: validUuid,
        }).success
      ).toBe(true);
    }
  });

  it('rejects unknown status', () => {
    expect(
      updateTicketStatusSchema.safeParse({
        status: 'archived',
        ticket_id: validUuid,
      }).success
    ).toBe(false);
  });
});

describe('assignContractSchema', () => {
  it('accepts two valid UUIDs', () => {
    expect(
      assignContractSchema.safeParse({
        ticket_id: validUuid,
        contract_id: validUuid,
      }).success
    ).toBe(true);
  });

  it('rejects missing contract_id', () => {
    expect(
      assignContractSchema.safeParse({ ticket_id: validUuid }).success
    ).toBe(false);
  });
});

describe('updateTimeSpentSchema', () => {
  it('accepts valid integer minutes', () => {
    expect(
      updateTimeSpentSchema.safeParse({
        ticket_id: validUuid,
        time_spent_minutes: 120,
      }).success
    ).toBe(true);
  });

  it('rejects negative minutes', () => {
    expect(
      updateTimeSpentSchema.safeParse({
        ticket_id: validUuid,
        time_spent_minutes: -1,
      }).success
    ).toBe(false);
  });

  it('rejects non-integer minutes', () => {
    expect(
      updateTimeSpentSchema.safeParse({
        ticket_id: validUuid,
        time_spent_minutes: 30.5,
      }).success
    ).toBe(false);
  });

  it('rejects more than 10000 minutes', () => {
    expect(
      updateTimeSpentSchema.safeParse({
        ticket_id: validUuid,
        time_spent_minutes: 10001,
      }).success
    ).toBe(false);
  });

  it('accepts exactly 10000 minutes (boundary)', () => {
    expect(
      updateTimeSpentSchema.safeParse({
        ticket_id: validUuid,
        time_spent_minutes: 10000,
      }).success
    ).toBe(true);
  });

  it('accepts 0 minutes', () => {
    expect(
      updateTimeSpentSchema.safeParse({
        ticket_id: validUuid,
        time_spent_minutes: 0,
      }).success
    ).toBe(true);
  });
});
