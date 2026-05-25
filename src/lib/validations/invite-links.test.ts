import { describe, it, expect } from 'vitest';
import {
  createInviteLinkSchema,
  guestTicketSchema,
  registerFromInviteSchema,
} from './invite-links';

describe('createInviteLinkSchema', () => {
  it('accepts minimal valid input', () => {
    expect(
      createInviteLinkSchema.safeParse({ organization_id: 'org-123' }).success
    ).toBe(true);
  });

  it('rejects empty organization_id', () => {
    expect(
      createInviteLinkSchema.safeParse({ organization_id: '' }).success
    ).toBe(false);
  });

  it('accepts optional label', () => {
    expect(
      createInviteLinkSchema.safeParse({
        organization_id: 'org-123',
        label: 'Lien support clients',
      }).success
    ).toBe(true);
  });

  it('rejects label longer than 255 chars', () => {
    expect(
      createInviteLinkSchema.safeParse({
        organization_id: 'org-123',
        label: 'a'.repeat(256),
      }).success
    ).toBe(false);
  });

  it('accepts valid ISO datetime for expires_at', () => {
    expect(
      createInviteLinkSchema.safeParse({
        organization_id: 'org-123',
        expires_at: '2026-12-31T23:59:59Z',
      }).success
    ).toBe(true);
  });

  it('rejects malformed expires_at', () => {
    expect(
      createInviteLinkSchema.safeParse({
        organization_id: 'org-123',
        expires_at: '2026-12-31',
      }).success
    ).toBe(false);
  });
});

describe('guestTicketSchema', () => {
  const baseValid = {
    token: 'abc123',
    guest_name: 'Jean Dupont',
    guest_email: 'jean@example.com',
    title: 'Probleme de connexion',
    description: 'Impossible de me connecter au portail depuis ce matin',
    priority: 'high' as const,
    category: 'bug' as const,
  };

  it('accepts a fully valid guest ticket', () => {
    expect(guestTicketSchema.safeParse(baseValid).success).toBe(true);
  });

  it('rejects invalid guest email', () => {
    expect(
      guestTicketSchema.safeParse({ ...baseValid, guest_email: 'invalid' })
        .success
    ).toBe(false);
  });

  it('rejects guest name too short', () => {
    expect(
      guestTicketSchema.safeParse({ ...baseValid, guest_name: 'a' }).success
    ).toBe(false);
  });

  it('rejects empty token', () => {
    expect(
      guestTicketSchema.safeParse({ ...baseValid, token: '' }).success
    ).toBe(false);
  });
});

describe('registerFromInviteSchema', () => {
  const baseValid = {
    token: 'abc123',
    name: 'Marie Martin',
    email: 'marie@example.com',
    password: 'SecurePass123!',
  };

  it('accepts a valid registration', () => {
    expect(registerFromInviteSchema.safeParse(baseValid).success).toBe(true);
  });

  it('rejects password shorter than 8 characters', () => {
    expect(
      registerFromInviteSchema.safeParse({ ...baseValid, password: 'short' })
        .success
    ).toBe(false);
  });

  it('rejects password longer than 128 characters', () => {
    expect(
      registerFromInviteSchema.safeParse({
        ...baseValid,
        password: 'a'.repeat(129),
      }).success
    ).toBe(false);
  });

  it('accepts password of exactly 8 chars (boundary)', () => {
    expect(
      registerFromInviteSchema.safeParse({ ...baseValid, password: '12345678' })
        .success
    ).toBe(true);
  });

  it('rejects invalid email', () => {
    expect(
      registerFromInviteSchema.safeParse({ ...baseValid, email: 'no-at-sign' })
        .success
    ).toBe(false);
  });
});
