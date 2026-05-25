import { describe, it, expect } from 'vitest';
import { createCommentSchema } from './comments';

const validUuid = '550e8400-e29b-41d4-a716-446655440000';

describe('createCommentSchema', () => {
  it('accepts a basic comment', () => {
    expect(
      createCommentSchema.safeParse({
        ticket_id: validUuid,
        content: 'Voici ma reponse au ticket',
      }).success
    ).toBe(true);
  });

  it('defaults is_internal to false', () => {
    const result = createCommentSchema.safeParse({
      ticket_id: validUuid,
      content: 'Hello',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.is_internal).toBe(false);
    }
  });

  it('accepts is_internal=true', () => {
    expect(
      createCommentSchema.safeParse({
        ticket_id: validUuid,
        content: 'Note privée',
        is_internal: true,
      }).success
    ).toBe(true);
  });

  it('rejects empty content', () => {
    expect(
      createCommentSchema.safeParse({ ticket_id: validUuid, content: '' })
        .success
    ).toBe(false);
  });

  it('rejects content longer than 5000 chars', () => {
    expect(
      createCommentSchema.safeParse({
        ticket_id: validUuid,
        content: 'a'.repeat(5001),
      }).success
    ).toBe(false);
  });

  it('rejects invalid ticket_id UUID', () => {
    expect(
      createCommentSchema.safeParse({
        ticket_id: 'not-a-uuid',
        content: 'Hello',
      }).success
    ).toBe(false);
  });
});
