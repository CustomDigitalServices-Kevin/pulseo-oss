import { describe, it, expect } from 'vitest';
import { createMagicLinkSchema } from './magic-links';

describe('createMagicLinkSchema', () => {
  it('accepts a valid input', () => {
    expect(
      createMagicLinkSchema.safeParse({
        email: 'alex@example.com',
        organization_id: 'org-123',
      }).success
    ).toBe(true);
  });

  it('rejects invalid email', () => {
    expect(
      createMagicLinkSchema.safeParse({
        email: 'not-an-email',
        organization_id: 'org-123',
      }).success
    ).toBe(false);
  });

  it('rejects empty organization_id', () => {
    expect(
      createMagicLinkSchema.safeParse({
        email: 'alex@example.com',
        organization_id: '',
      }).success
    ).toBe(false);
  });

  it('rejects missing email', () => {
    expect(
      createMagicLinkSchema.safeParse({ organization_id: 'org-123' }).success
    ).toBe(false);
  });
});
