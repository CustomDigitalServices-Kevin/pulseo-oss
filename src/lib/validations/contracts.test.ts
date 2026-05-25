import { describe, it, expect } from 'vitest';
import {
  createContractSchema,
  updateContractSchema,
  terminateContractSchema,
} from './contracts';

const validUuid = '550e8400-e29b-41d4-a716-446655440000';

describe('createContractSchema', () => {
  const baseValid = {
    name: 'Support Premium 2026',
    organization_id: validUuid,
    quota_hours: '40',
    rate_per_hour: '85.00',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
  };

  it('accepts a fully valid contract', () => {
    expect(createContractSchema.safeParse(baseValid).success).toBe(true);
  });

  it('accepts decimal quota and rate', () => {
    expect(
      createContractSchema.safeParse({
        ...baseValid,
        quota_hours: '40.50',
        rate_per_hour: '99.99',
      }).success
    ).toBe(true);
  });

  it('rejects name shorter than 3 characters', () => {
    expect(
      createContractSchema.safeParse({ ...baseValid, name: 'ab' }).success
    ).toBe(false);
  });

  it('rejects invalid quota format (3 decimals)', () => {
    expect(
      createContractSchema.safeParse({ ...baseValid, quota_hours: '40.123' })
        .success
    ).toBe(false);
  });

  it('rejects invalid rate format (letters)', () => {
    expect(
      createContractSchema.safeParse({
        ...baseValid,
        rate_per_hour: '85eur',
      }).success
    ).toBe(false);
  });

  it('rejects end_date before start_date', () => {
    expect(
      createContractSchema.safeParse({
        ...baseValid,
        start_date: '2026-12-01',
        end_date: '2026-01-01',
      }).success
    ).toBe(false);
  });

  it('rejects end_date equal to start_date', () => {
    expect(
      createContractSchema.safeParse({
        ...baseValid,
        start_date: '2026-06-01',
        end_date: '2026-06-01',
      }).success
    ).toBe(false);
  });

  it('rejects invalid organization_id UUID', () => {
    expect(
      createContractSchema.safeParse({
        ...baseValid,
        organization_id: 'not-a-uuid',
      }).success
    ).toBe(false);
  });

  it('accepts optional description', () => {
    expect(
      createContractSchema.safeParse({
        ...baseValid,
        description: 'Contrat support et maintenance evolutive',
      }).success
    ).toBe(true);
  });

  it('rejects description longer than 5000 chars', () => {
    expect(
      createContractSchema.safeParse({
        ...baseValid,
        description: 'a'.repeat(5001),
      }).success
    ).toBe(false);
  });
});

describe('updateContractSchema', () => {
  it('accepts empty object (all fields optional)', () => {
    expect(updateContractSchema.safeParse({}).success).toBe(true);
  });

  it('accepts each valid status', () => {
    for (const s of ['active', 'expired', 'terminated'] as const) {
      expect(updateContractSchema.safeParse({ status: s }).success).toBe(true);
    }
  });

  it('rejects unknown status', () => {
    expect(updateContractSchema.safeParse({ status: 'paused' }).success).toBe(
      false
    );
  });
});

describe('terminateContractSchema', () => {
  it('accepts a valid UUID', () => {
    expect(
      terminateContractSchema.safeParse({ contract_id: validUuid }).success
    ).toBe(true);
  });

  it('rejects invalid UUID', () => {
    expect(
      terminateContractSchema.safeParse({ contract_id: 'invalid' }).success
    ).toBe(false);
  });
});
