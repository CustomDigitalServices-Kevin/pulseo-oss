import { describe, it, expect } from 'vitest';
import {
  createOrganizationSchema,
  updateOrganizationSchema,
} from './organizations';

describe('createOrganizationSchema', () => {
  const baseValid = {
    name: 'Acme Corp',
    slug: 'acme-corp',
  };

  it('accepts minimal valid input with default colors', () => {
    const result = createOrganizationSchema.safeParse(baseValid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.color_primary).toBe('#2563EB');
      expect(result.data.color_secondary).toBe('#1E40AF');
    }
  });

  it('rejects name shorter than 2 characters', () => {
    expect(
      createOrganizationSchema.safeParse({ ...baseValid, name: 'a' }).success
    ).toBe(false);
  });

  it('rejects slug with uppercase letters', () => {
    expect(
      createOrganizationSchema.safeParse({ ...baseValid, slug: 'Acme-Corp' })
        .success
    ).toBe(false);
  });

  it('rejects slug with spaces', () => {
    expect(
      createOrganizationSchema.safeParse({ ...baseValid, slug: 'acme corp' })
        .success
    ).toBe(false);
  });

  it('rejects slug with special characters', () => {
    expect(
      createOrganizationSchema.safeParse({ ...baseValid, slug: 'acme@corp' })
        .success
    ).toBe(false);
  });

  it('accepts slug with digits and hyphens', () => {
    expect(
      createOrganizationSchema.safeParse({ ...baseValid, slug: 'acme-2026' })
        .success
    ).toBe(true);
  });

  it('rejects invalid hex color', () => {
    expect(
      createOrganizationSchema.safeParse({
        ...baseValid,
        color_primary: '2563EB',
      }).success
    ).toBe(false);
  });

  it('rejects 3-digit hex color', () => {
    expect(
      createOrganizationSchema.safeParse({
        ...baseValid,
        color_primary: '#abc',
      }).success
    ).toBe(false);
  });

  it('accepts a valid #RRGGBB color', () => {
    expect(
      createOrganizationSchema.safeParse({
        ...baseValid,
        color_primary: '#FF5733',
      }).success
    ).toBe(true);
  });

  it('accepts an empty string for qonto_client_email', () => {
    expect(
      createOrganizationSchema.safeParse({
        ...baseValid,
        qonto_client_email: '',
      }).success
    ).toBe(true);
  });

  it('accepts a valid Qonto email', () => {
    expect(
      createOrganizationSchema.safeParse({
        ...baseValid,
        qonto_client_email: 'billing@acme.com',
      }).success
    ).toBe(true);
  });

  it('rejects an invalid Qonto email', () => {
    expect(
      createOrganizationSchema.safeParse({
        ...baseValid,
        qonto_client_email: 'not-an-email',
      }).success
    ).toBe(false);
  });
});

describe('updateOrganizationSchema (partial)', () => {
  it('accepts empty object', () => {
    expect(updateOrganizationSchema.safeParse({}).success).toBe(true);
  });

  it('accepts a single field update', () => {
    expect(
      updateOrganizationSchema.safeParse({ name: 'Renamed Corp' }).success
    ).toBe(true);
  });

  it('still validates each field if provided', () => {
    expect(
      updateOrganizationSchema.safeParse({ slug: 'INVALID' }).success
    ).toBe(false);
  });
});
