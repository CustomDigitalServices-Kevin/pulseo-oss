/**
 * Tests for the createComment server action, focused on the notification
 * contract: an internal (staff-only) comment must never be emailed to the
 * client side — neither creator/guest nor the org's responsables
 * (includeClientContacts flag).
 *
 * Same harness pattern as tickets.test.ts: db, session, roles and email
 * helpers are mocked; the action runs its real validation and control flow.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => {
  class RoleErrorMock extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'RoleError';
    }
  }

  function createInsertChain() {
    let returnValue: unknown = [];
    const chain = {
      values: vi.fn(),
      returning: vi.fn(),
      setReturnValue(value: unknown) {
        returnValue = value;
      },
      then(resolve: (v: unknown) => void) {
        resolve(undefined);
      },
    };
    chain.values.mockReturnValue(chain);
    chain.returning.mockImplementation(() => Promise.resolve(returnValue));
    return chain;
  }

  function createUpdateChain() {
    const chain = {
      set: vi.fn(),
      where: vi.fn(),
      then(resolve: (v: unknown) => void) {
        resolve(undefined);
      },
    };
    chain.set.mockReturnValue(chain);
    chain.where.mockReturnValue(chain);
    return chain;
  }

  const insertChain = createInsertChain();
  const updateChain = createUpdateChain();

  const mockDb = {
    query: {
      tickets: { findFirst: vi.fn() },
      users: { findFirst: vi.fn() },
    },
    insert: vi.fn(() => insertChain),
    update: vi.fn(() => updateChain),
    transaction: vi.fn(async (cb: (tx: typeof mockDb) => Promise<unknown>) =>
      cb(mockDb),
    ),
  };

  const requireSessionMock = vi.fn();
  const requireRoleMock = vi.fn();
  const getMemberRoleMock = vi.fn();
  const getRecipientsMock = vi.fn();
  const getOrgSlugMock = vi.fn();
  const sendEmailMock = vi.fn();

  return {
    mockDb,
    insertChain,
    updateChain,
    requireSessionMock,
    requireRoleMock,
    getMemberRoleMock,
    getRecipientsMock,
    getOrgSlugMock,
    sendEmailMock,
    RoleErrorMock,
  };
});

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: hoisted.mockDb }));

vi.mock('@/lib/auth/session', () => ({
  requireSession: () => hoisted.requireSessionMock(),
}));

vi.mock('@/lib/auth/require-role', () => ({
  requireEffectiveRole: (...args: unknown[]) => hoisted.requireRoleMock(...args),
  getMemberRole: (...args: unknown[]) => hoisted.getMemberRoleMock(...args),
  RoleError: hoisted.RoleErrorMock,
}));

vi.mock('@/lib/activity/log-event', () => ({
  logActivityEvent: vi.fn(),
}));

vi.mock('@/lib/email/notifications', () => ({
  getTicketNotificationRecipients: (...args: unknown[]) =>
    hoisted.getRecipientsMock(...args),
  getOrganizationSlug: (...args: unknown[]) => hoisted.getOrgSlugMock(...args),
}));

vi.mock('@/lib/email/tickets', () => ({
  sendTicketNotificationEmail: (...args: unknown[]) =>
    hoisted.sendEmailMock(...args),
}));

import { createComment } from './comments';

const SESSION = { user: { id: 'user-1', email: 'staff@x.com', name: 'Staff' } };
const ORG_ID = '11111111-1111-4111-8111-111111111111';
const TICKET_ID = '22222222-2222-4222-8222-222222222222';

const TICKET = {
  id: TICKET_ID,
  organization_id: ORG_ID,
  creator_id: 'creator-1',
  guest_email: 'guest@client.com',
  responded_at: new Date('2026-01-01T00:00:00Z'),
};

beforeEach(() => {
  hoisted.mockDb.query.tickets.findFirst.mockReset();
  hoisted.mockDb.query.users.findFirst.mockReset();
  hoisted.mockDb.insert.mockClear();
  hoisted.requireSessionMock.mockReset();
  hoisted.requireRoleMock.mockReset();
  hoisted.getMemberRoleMock.mockReset();
  hoisted.getRecipientsMock.mockReset();
  hoisted.getOrgSlugMock.mockReset();
  hoisted.sendEmailMock.mockReset();
  hoisted.insertChain.values.mockClear();

  hoisted.mockDb.insert.mockImplementation(() => hoisted.insertChain);
  hoisted.insertChain.values.mockReturnValue(hoisted.insertChain);

  hoisted.requireSessionMock.mockResolvedValue(SESSION);
  hoisted.requireRoleMock.mockResolvedValue({ role: 'gestionnaire', isSuperadmin: false });
  hoisted.getMemberRoleMock.mockResolvedValue({ role: 'gestionnaire', isSuperadmin: false });
  hoisted.mockDb.query.tickets.findFirst.mockResolvedValue(TICKET);
  hoisted.mockDb.query.users.findFirst.mockResolvedValue({
    name: 'Staff',
    email: 'staff@x.com',
  });
  hoisted.getRecipientsMock.mockResolvedValue(['manager@x.com']);
  hoisted.getOrgSlugMock.mockResolvedValue('acme-paris');
  hoisted.insertChain.setReturnValue([
    {
      id: 'comment-1',
      ticket_id: TICKET_ID,
      author_id: SESSION.user.id,
      content: 'hello',
      is_internal: false,
    },
  ]);
});

describe('createComment — notification recipients', () => {
  it('passes creator, guest and includeClientContacts=true for a public comment', async () => {
    const result = await createComment({
      ticket_id: TICKET_ID,
      content: 'Reponse visible client',
      is_internal: false,
    });

    expect(result.success).toBe(true);
    expect(hoisted.getRecipientsMock).toHaveBeenCalledWith({
      orgId: ORG_ID,
      ticketCreatorId: 'creator-1',
      guestEmail: 'guest@client.com',
      excludeActorId: SESSION.user.id,
      includeClientContacts: true,
    });
    expect(hoisted.sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it('nulls creator/guest and passes includeClientContacts=false for an internal comment', async () => {
    const result = await createComment({
      ticket_id: TICKET_ID,
      content: 'Note interne staff',
      is_internal: true,
    });

    expect(result.success).toBe(true);
    expect(hoisted.getRecipientsMock).toHaveBeenCalledWith({
      orgId: ORG_ID,
      ticketCreatorId: null,
      guestEmail: null,
      excludeActorId: SESSION.user.id,
      includeClientContacts: false,
    });
  });

  it('returns an error when the ticket does not exist', async () => {
    hoisted.mockDb.query.tickets.findFirst.mockResolvedValue(undefined);
    const result = await createComment({
      ticket_id: TICKET_ID,
      content: 'x',
      is_internal: false,
    });
    expect(result.success).toBe(false);
    expect(hoisted.getRecipientsMock).not.toHaveBeenCalled();
  });

  it('still succeeds when the notification email fails', async () => {
    hoisted.getRecipientsMock.mockRejectedValue(new Error('smtp down'));
    const result = await createComment({
      ticket_id: TICKET_ID,
      content: 'contenu',
      is_internal: false,
    });
    expect(result.success).toBe(true);
  });
});
