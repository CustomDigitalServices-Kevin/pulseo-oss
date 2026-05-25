import { describe, it, expect } from 'vitest';
import { uploadDocumentSchema } from './documents';

const validUuid = '550e8400-e29b-41d4-a716-446655440000';

describe('uploadDocumentSchema', () => {
  const baseValid = {
    title: 'Facture Janvier 2026',
    type: 'invoice' as const,
    organization_id: validUuid,
  };

  it('accepts a minimal valid document', () => {
    expect(uploadDocumentSchema.safeParse(baseValid).success).toBe(true);
  });

  it('accepts each valid document type', () => {
    for (const t of ['invoice', 'quote', 'report', 'other'] as const) {
      expect(
        uploadDocumentSchema.safeParse({ ...baseValid, type: t }).success
      ).toBe(true);
    }
  });

  it('rejects unknown document type', () => {
    expect(
      uploadDocumentSchema.safeParse({ ...baseValid, type: 'contract' }).success
    ).toBe(false);
  });

  it('rejects title shorter than 3 characters', () => {
    expect(
      uploadDocumentSchema.safeParse({ ...baseValid, title: 'ab' }).success
    ).toBe(false);
  });

  it('rejects title longer than 200 characters', () => {
    expect(
      uploadDocumentSchema.safeParse({
        ...baseValid,
        title: 'a'.repeat(201),
      }).success
    ).toBe(false);
  });

  it('accepts a valid amount string', () => {
    expect(
      uploadDocumentSchema.safeParse({ ...baseValid, amount: '1234.56' })
        .success
    ).toBe(true);
  });

  it('rejects amount with 3 decimals', () => {
    expect(
      uploadDocumentSchema.safeParse({ ...baseValid, amount: '1234.567' })
        .success
    ).toBe(false);
  });

  it('rejects amount with letters', () => {
    expect(
      uploadDocumentSchema.safeParse({ ...baseValid, amount: '1000eur' })
        .success
    ).toBe(false);
  });

  it('accepts null amount', () => {
    expect(
      uploadDocumentSchema.safeParse({ ...baseValid, amount: null }).success
    ).toBe(true);
  });

  it('accepts a valid issued_at date string', () => {
    expect(
      uploadDocumentSchema.safeParse({
        ...baseValid,
        issued_at: '2026-01-15',
      }).success
    ).toBe(true);
  });
});
