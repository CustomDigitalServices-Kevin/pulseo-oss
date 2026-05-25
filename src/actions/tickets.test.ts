/**
 * Integration-style tests for tickets server actions.
 *
 * We mock the database, session, role checks and email helpers so the
 * actions run their real validation and control flow against fakes.
 *
 * What we verify:
 *   - Validation errors return user-friendly messages
 *   - Role failures return the RoleError message
 *   - Cross-org bulk updates are rejected
 *   - Successful paths produce the expected DB calls and return data
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted runs before vi.mock factories so its return value is safe to
// reference inside the mocked module factories below.
const hoisted = vi.hoisted(() => {
  const loggerCalls: Array<{ level: string; msg: string; ctx?: unknown }> = [];

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
    let returnValue: unknown = [];
    const chain = {
      set: vi.fn(),
      where: vi.fn(),
      returning: vi.fn(),
      setReturnValue(value: unknown) {
        returnValue = value;
      },
      then(resolve: (v: unknown) => void) {
        resolve(undefined);
      },
    };
    chain.set.mockReturnValue(chain);
    chain.where.mockReturnValue(chain);
    chain.returning.mockImplementation(() => Promise.resolve(returnValue));
    return chain;
  }

  const insertChain = createInsertChain();
  const updateChain = createUpdateChain();

  const mockDb = {
    query: {
      tickets: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      organization_members: {
        findFirst: vi.fn(),
      },
      contracts: {
        findFirst: vi.fn(),
      },
    },
    insert: vi.fn(() => insertChain),
    update: vi.fn(() => updateChain),
    delete: vi.fn(),
    select: vi.fn(),
    // createTicket wraps the insert in a transaction to take a per-org
    // advisory lock against ticket-number race conditions (cf P1-5 audit).
    // The mock simply forwards to the same insert/update chains so the
    // existing assertions on `insertChain.values.mock.calls[0]?.[0]` keep
    // working without rewriting every test.
    transaction: vi.fn(async (cb: (tx: typeof mockDb) => Promise<unknown>) =>
      cb(mockDb),
    ),
    execute: vi.fn().mockResolvedValue(undefined),
  };

  const requireSessionMock = vi.fn();
  const requireRoleMock = vi.fn();

  return {
    mockDb,
    insertChain,
    updateChain,
    requireSessionMock,
    requireRoleMock,
    RoleErrorMock,
    loggerCalls,
  };
});

vi.mock('@/lib/logger', () => ({
  logger: {
    info: (msg: string, ctx?: unknown) =>
      hoisted.loggerCalls.push({ level: 'info', msg, ctx }),
    warn: (msg: string, ctx?: unknown) =>
      hoisted.loggerCalls.push({ level: 'warn', msg, ctx }),
    error: (msg: string, ctx?: unknown) =>
      hoisted.loggerCalls.push({ level: 'error', msg, ctx }),
    debug: (msg: string, ctx?: unknown) =>
      hoisted.loggerCalls.push({ level: 'debug', msg, ctx }),
  },
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(() => Promise.resolve(new Map())),
}));

vi.mock('@/lib/db', () => ({ db: hoisted.mockDb }));

vi.mock('@/lib/auth/session', () => ({
  requireSession: () => hoisted.requireSessionMock(),
}));

vi.mock('@/lib/auth/require-role', () => ({
  requireEffectiveRole: (...args: unknown[]) => hoisted.requireRoleMock(...args),
  RoleError: hoisted.RoleErrorMock,
}));

vi.mock('@/lib/email/notifications', () => ({
  getTicketNotificationRecipients: vi.fn(() => Promise.resolve([])),
}));

vi.mock('@/lib/email/tickets', () => ({
  sendTicketNotificationEmail: vi.fn(() => Promise.resolve()),
}));

// Import after mocks are in place.
import {
  createTicket,
  updateTicketTags,
  bulkUpdateTicketStatus,
} from './tickets';

// Note: Zod 4's UUID validation enforces version (1-8) and variant (8/9/a/b)
// nibbles, so we use valid v4 UUIDs (version=4, variant=8) here.
const SESSION = { user: { id: 'user-1', email: 'u@x.com', name: 'U' } };
const ORG_ID = '11111111-1111-4111-8111-111111111111';
const TICKET_ID = '22222222-2222-4222-8222-222222222222';
const CONTRACT_ID = '33333333-3333-4333-8333-333333333333';
const TICKET_ID_2 = '44444444-4444-4444-8444-444444444444';
const TICKET_ID_3 = '55555555-5555-4555-8555-555555555555';

beforeEach(() => {
  // Clear call history on top-level mocks but preserve implementations.
  // We must not call vi.clearAllMocks() because it would also clear the
  // chain.set/where/values/returning implementations set up via mockReturnValue.
  hoisted.mockDb.query.tickets.findFirst.mockReset();
  hoisted.mockDb.query.tickets.findMany.mockReset();
  hoisted.mockDb.query.contracts.findFirst.mockReset();
  hoisted.mockDb.query.organization_members.findFirst.mockReset();
  hoisted.mockDb.insert.mockClear();
  hoisted.mockDb.update.mockClear();
  hoisted.requireSessionMock.mockReset();
  hoisted.requireRoleMock.mockReset();

  // Clear call history of chain methods (without removing implementations)
  hoisted.insertChain.values.mockClear();
  hoisted.updateChain.set.mockClear();
  hoisted.updateChain.where.mockClear();

  // Re-set implementations of insert/update on the db (mockClear can wipe these)
  hoisted.mockDb.insert.mockImplementation(() => hoisted.insertChain);
  hoisted.mockDb.update.mockImplementation(() => hoisted.updateChain);

  // Re-set chain method implementations
  hoisted.insertChain.values.mockReturnValue(hoisted.insertChain);
  hoisted.updateChain.set.mockReturnValue(hoisted.updateChain);
  hoisted.updateChain.where.mockReturnValue(hoisted.updateChain);

  // Re-establish defaults for the next test
  hoisted.requireSessionMock.mockResolvedValue(SESSION);
  hoisted.requireRoleMock.mockResolvedValue({ id: 'mem-1', role: 'gestionnaire' });
  hoisted.insertChain.setReturnValue([]);
  hoisted.updateChain.setReturnValue([]);

  // Reset captured logger calls
  hoisted.loggerCalls.length = 0;
});

// ─── createTicket ────────────────────────────────────────────────────────────

describe('createTicket', () => {
  const validInput = {
    title: 'Bug critique production',
    description: 'Le bouton de connexion est cassé',
    priority: 'high',
    category: 'bug',
    organization_id: ORG_ID,
  };

  it('returns a Zod validation error when input is malformed', async () => {
    const result = await createTicket({ title: 'ab' });
    expect(result.success).toBe(false);
  });

  it('returns a friendly error when role check fails', async () => {
    hoisted.requireRoleMock.mockRejectedValueOnce(
      new hoisted.RoleErrorMock('Acces non autorise')
    );
    const result = await createTicket(validInput);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Acces non autorise');
  });

  it('inserts the ticket and returns success on happy path', async () => {
    const newTicket = {
      id: TICKET_ID,
      number: 1,
      title: validInput.title,
      organization_id: ORG_ID,
      tags: [],
    };
    hoisted.insertChain.setReturnValue([newTicket]);

    const result = await createTicket(validInput);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data?.id).toBe(TICKET_ID);
    }
    expect(hoisted.mockDb.insert).toHaveBeenCalled();
  });

  it('does NOT compute resolution_due_at when contract has no SLA', async () => {
    hoisted.mockDb.query.contracts.findFirst.mockResolvedValueOnce({
      organization_id: ORG_ID,
      sla_resolution_hours: null,
    });
    hoisted.insertChain.setReturnValue([{ id: TICKET_ID }]);

    await createTicket({ ...validInput, contract_id: CONTRACT_ID });

    const valuesCall = hoisted.insertChain.values.mock.calls[0]?.[0];
    expect(valuesCall.resolution_due_at).toBeNull();
  });

  it('computes resolution_due_at when contract has SLA', async () => {
    hoisted.mockDb.query.contracts.findFirst.mockResolvedValueOnce({
      organization_id: ORG_ID,
      sla_resolution_hours: 24,
    });
    hoisted.insertChain.setReturnValue([{ id: TICKET_ID }]);

    const before = Date.now();
    await createTicket({ ...validInput, contract_id: CONTRACT_ID });
    const after = Date.now();

    const valuesCall = hoisted.insertChain.values.mock.calls[0]?.[0];
    expect(valuesCall.resolution_due_at).toBeInstanceOf(Date);
    const dueMs = (valuesCall.resolution_due_at as Date).getTime();
    expect(dueMs).toBeGreaterThanOrEqual(before + 24 * 3600 * 1000);
    expect(dueMs).toBeLessThanOrEqual(after + 24 * 3600 * 1000);
  });

  it('rejects createTicket when contract belongs to a different org (IDOR guard)', async () => {
    const OTHER_ORG = '99999999-9999-4999-8999-999999999999';
    hoisted.mockDb.query.contracts.findFirst.mockResolvedValueOnce({
      organization_id: OTHER_ORG,
      sla_resolution_hours: 24,
    });

    const result = await createTicket({ ...validInput, contract_id: CONTRACT_ID });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/contrat invalide/i);
    expect(hoisted.insertChain.values).not.toHaveBeenCalled();
  });

  it('passes tags to the insert when provided', async () => {
    hoisted.insertChain.setReturnValue([{ id: TICKET_ID }]);
    await createTicket({ ...validInput, tags: ['urgent', 'frontend'] });
    const valuesCall = hoisted.insertChain.values.mock.calls[0]?.[0];
    expect(valuesCall.tags).toEqual(['urgent', 'frontend']);
  });

  it('defaults tags to empty array when not provided', async () => {
    hoisted.insertChain.setReturnValue([{ id: TICKET_ID }]);
    await createTicket(validInput);
    const valuesCall = hoisted.insertChain.values.mock.calls[0]?.[0];
    expect(valuesCall.tags).toEqual([]);
  });
});

// ─── updateTicketTags ────────────────────────────────────────────────────────

describe('updateTicketTags', () => {
  it('rejects when ticket does not exist', async () => {
    hoisted.mockDb.query.tickets.findFirst.mockResolvedValueOnce(undefined);
    const result = await updateTicketTags({
      ticket_id: TICKET_ID,
      tags: ['a'],
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('non trouve');
  });

  it('returns RoleError message when role check fails', async () => {
    hoisted.mockDb.query.tickets.findFirst.mockResolvedValueOnce({
      id: TICKET_ID,
      organization_id: ORG_ID,
      tags: [],
    });
    hoisted.requireRoleMock.mockRejectedValueOnce(
      new hoisted.RoleErrorMock('Role insuffisant')
    );
    const result = await updateTicketTags({
      ticket_id: TICKET_ID,
      tags: ['a'],
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Role insuffisant');
  });

  it('updates tags on happy path', async () => {
    hoisted.mockDb.query.tickets.findFirst.mockResolvedValueOnce({
      id: TICKET_ID,
      organization_id: ORG_ID,
      tags: ['old'],
    });
    hoisted.updateChain.setReturnValue([
      { id: TICKET_ID, tags: ['new', 'urgent'] },
    ]);

    const result = await updateTicketTags({
      ticket_id: TICKET_ID,
      tags: ['new', 'urgent'],
    });

    expect(result.success).toBe(true);
    expect(hoisted.updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ tags: ['new', 'urgent'] })
    );
  });

  it('rejects more than 10 tags via Zod', async () => {
    hoisted.mockDb.query.tickets.findFirst.mockResolvedValueOnce({
      id: TICKET_ID,
      organization_id: ORG_ID,
    });
    const result = await updateTicketTags({
      ticket_id: TICKET_ID,
      tags: Array.from({ length: 11 }, (_, i) => `tag${i}`),
    });
    expect(result.success).toBe(false);
  });

  it('rejects malformed tags via Zod', async () => {
    hoisted.mockDb.query.tickets.findFirst.mockResolvedValueOnce({
      id: TICKET_ID,
      organization_id: ORG_ID,
    });
    const result = await updateTicketTags({
      ticket_id: TICKET_ID,
      tags: ['UPPERCASE'],
    });
    expect(result.success).toBe(false);
  });
});

// ─── bulkUpdateTicketStatus ──────────────────────────────────────────────────

describe('bulkUpdateTicketStatus', () => {
  it('rejects an empty ticket_ids array via Zod', async () => {
    const result = await bulkUpdateTicketStatus({
      ticket_ids: [],
      status: 'closed',
    });
    expect(result.success).toBe(false);
  });

  it('rejects more than 100 tickets via Zod', async () => {
    // Use valid v4 UUIDs so the array length check fires before format check
    const tooMany = Array.from({ length: 101 }, () => TICKET_ID);
    const result = await bulkUpdateTicketStatus({
      ticket_ids: tooMany,
      status: 'closed',
    });
    expect(result.success).toBe(false);
  });

  it('rejects when no tickets are found', async () => {
    hoisted.mockDb.query.tickets.findMany.mockResolvedValueOnce([]);
    const result = await bulkUpdateTicketStatus({
      ticket_ids: [TICKET_ID],
      status: 'closed',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Aucun ticket');
  });

  it('rejects when tickets span multiple organizations', async () => {
    hoisted.mockDb.query.tickets.findMany.mockResolvedValueOnce([
      { id: 't1', organization_id: 'org-A', status: 'new' },
      { id: 't2', organization_id: 'org-B', status: 'new' },
    ]);
    const result = await bulkUpdateTicketStatus({
      ticket_ids: [
        TICKET_ID,
        TICKET_ID_2,
      ],
      status: 'closed',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('plusieurs organisations');
  });

  it('returns role error when user is not at least gestionnaire', async () => {
    hoisted.mockDb.query.tickets.findMany.mockResolvedValueOnce([
      { id: 't1', organization_id: ORG_ID, status: 'new' },
    ]);
    hoisted.requireRoleMock.mockRejectedValueOnce(
      new hoisted.RoleErrorMock('Role insuffisant')
    );
    const result = await bulkUpdateTicketStatus({
      ticket_ids: [TICKET_ID],
      status: 'in_progress',
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Role insuffisant');
  });

  it('updates all tickets on happy path and returns the count', async () => {
    // All three tickets are in a status that allows transition to "resolved"
    hoisted.mockDb.query.tickets.findMany.mockResolvedValueOnce([
      { id: 't1', organization_id: ORG_ID, status: 'in_progress' },
      { id: 't2', organization_id: ORG_ID, status: 'in_progress' },
      { id: 't3', organization_id: ORG_ID, status: 'waiting_client' },
    ]);

    const result = await bulkUpdateTicketStatus({
      ticket_ids: [TICKET_ID, TICKET_ID_2, TICKET_ID_3],
      status: 'resolved',
    });

    if (!result.success) {
      throw new Error(
        `Action returned false. Logger captured: ${JSON.stringify(hoisted.loggerCalls)}`
      );
    }
    expect(result.data?.updated).toBe(3);
    expect(hoisted.mockDb.update).toHaveBeenCalled();
  });

  it('rejects bulk update when any ticket has an invalid transition', async () => {
    // "new" → "resolved" is NOT a valid transition (must go through in_progress first)
    hoisted.mockDb.query.tickets.findMany.mockResolvedValueOnce([
      { id: 't1', organization_id: ORG_ID, status: 'in_progress' },
      { id: 't2', organization_id: ORG_ID, status: 'new' },
    ]);

    const result = await bulkUpdateTicketStatus({
      ticket_ids: [TICKET_ID, TICKET_ID_2],
      status: 'resolved',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Transition invalide');
    expect(hoisted.mockDb.update).not.toHaveBeenCalled();
  });

  it('allows idempotent bulk update (already in target status)', async () => {
    // Tickets already resolved → updating to resolved is a no-op transition allowed
    hoisted.mockDb.query.tickets.findMany.mockResolvedValueOnce([
      { id: 't1', organization_id: ORG_ID, status: 'resolved' },
    ]);

    const result = await bulkUpdateTicketStatus({
      ticket_ids: [TICKET_ID],
      status: 'resolved',
    });

    expect(result.success).toBe(true);
  });

  it('sets closed_at when status is closed', async () => {
    hoisted.mockDb.query.tickets.findMany.mockResolvedValueOnce([
      { id: 't1', organization_id: ORG_ID, status: 'resolved' },
    ]);
    await bulkUpdateTicketStatus({
      ticket_ids: [TICKET_ID],
      status: 'closed',
    });
    const setCall = hoisted.updateChain.set.mock.calls[0]?.[0];
    expect(setCall.closed_at).toBeInstanceOf(Date);
  });

  it('does NOT set closed_at when status is not closed', async () => {
    hoisted.mockDb.query.tickets.findMany.mockResolvedValueOnce([
      { id: 't1', organization_id: ORG_ID, status: 'new' },
    ]);
    const result = await bulkUpdateTicketStatus({
      ticket_ids: [TICKET_ID],
      status: 'in_progress',
    });
    expect(result.success).toBe(true);
    const setCall = hoisted.updateChain.set.mock.calls[0]?.[0];
    expect(setCall.closed_at).toBeUndefined();
  });
});
