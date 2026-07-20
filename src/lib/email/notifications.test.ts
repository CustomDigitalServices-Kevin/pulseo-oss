/**
 * Tests for getTicketNotificationRecipients — in particular the
 * `includeClientContacts` flag that keeps internal (staff-only) events from
 * being emailed to client-side contacts (responsables + legacy column).
 *
 * The db mock resolves `db.select()...` chains in call order via a FIFO
 * queue: the function under test issues its selects in a deterministic
 * order (managers → manager users → [responsibles, org meta] → superadmins),
 * so each test enqueues results in that same order.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => {
  const selectResults: unknown[] = [];
  const findFirstResults: unknown[] = [];

  function createSelectChain() {
    const chain = {
      from: vi.fn(),
      where: vi.fn(),
      limit: vi.fn(),
      then(resolve: (v: unknown) => void) {
        resolve(selectResults.shift() ?? []);
      },
    };
    chain.from.mockReturnValue(chain);
    chain.where.mockReturnValue(chain);
    chain.limit.mockReturnValue(chain);
    return chain;
  }

  const mockDb = {
    select: vi.fn(() => createSelectChain()),
    query: {
      users: {
        findFirst: vi.fn(() => Promise.resolve(findFirstResults.shift() ?? null)),
      },
    },
  };

  return { mockDb, selectResults, findFirstResults };
});

vi.mock('@/lib/db', () => ({ db: hoisted.mockDb }));

vi.mock('@/lib/email', () => ({
  sendEmail: vi.fn(() => Promise.resolve()),
  escapeHtml: (s: string) => s,
}));

vi.mock('@/config/app-config', () => ({
  appConfig: { name: 'Pulseo', primaryColor: '#2563EB' },
  getServerAppUrl: () => 'https://pulseo.test',
  getEmailFooterBrand: () => 'Pulseo',
}));

import { getTicketNotificationRecipients } from './notifications';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const CREATOR_ID = '22222222-2222-4222-8222-222222222222';
const ACTOR_ID = '33333333-3333-4333-8333-333333333333';

beforeEach(() => {
  hoisted.selectResults.length = 0;
  hoisted.findFirstResults.length = 0;
  hoisted.mockDb.select.mockClear();
  hoisted.mockDb.query.users.findFirst.mockClear();
});

describe('getTicketNotificationRecipients', () => {
  it('includes managers, creator, guest, responsables, legacy and superadmins by default', async () => {
    hoisted.selectResults.push(
      [{ userId: 'm1', role: 'gestionnaire' }], // managers of the org
      [{ id: 'm1', email: 'manager@x.com' }], // manager users
      [{ email: 'resp@client.com' }], // organization_responsibles
      [{ responsibleEmail: 'legacy@client.com' }], // legacy org column
      [{ email: 'super@x.com' }], // superadmins
    );
    hoisted.findFirstResults.push(
      { email: 'creator@client.com' }, // ticket creator
      { email: 'actor@x.com' }, // actor (excluded)
    );

    const recipients = await getTicketNotificationRecipients({
      orgId: ORG_ID,
      ticketCreatorId: CREATOR_ID,
      guestEmail: 'guest@client.com',
      excludeActorId: ACTOR_ID,
    });

    expect(recipients.sort()).toEqual(
      [
        'manager@x.com',
        'creator@client.com',
        'guest@client.com',
        'resp@client.com',
        'legacy@client.com',
        'super@x.com',
      ].sort(),
    );
    expect(recipients).not.toContain('actor@x.com');
  });

  it('excludes responsables and legacy contact when includeClientContacts is false', async () => {
    hoisted.selectResults.push(
      [{ userId: 'm1', role: 'gestionnaire' }], // managers of the org
      [{ id: 'm1', email: 'manager@x.com' }], // manager users
      // no responsibles/org meta selects: the client-contacts block is skipped
      [{ email: 'super@x.com' }], // superadmins
    );
    hoisted.findFirstResults.push(
      { email: 'actor@x.com' }, // actor (excluded) — no creator lookup (null)
    );

    const recipients = await getTicketNotificationRecipients({
      orgId: ORG_ID,
      ticketCreatorId: null,
      guestEmail: null,
      excludeActorId: ACTOR_ID,
      includeClientContacts: false,
    });

    expect(recipients.sort()).toEqual(['manager@x.com', 'super@x.com'].sort());
    // 3 selects only: managers, manager users, superadmins — the two
    // client-contact selects (responsibles + org meta) must not run.
    expect(hoisted.mockDb.select).toHaveBeenCalledTimes(3);
  });

  it('still reaches the client contacts when includeClientContacts is true explicitly', async () => {
    hoisted.selectResults.push(
      [], // no managers
      [{ email: 'resp@client.com' }], // organization_responsibles
      [{}], // legacy org column absent
      [], // no superadmins
    );
    hoisted.findFirstResults.push(
      null, // actor not found
    );

    const recipients = await getTicketNotificationRecipients({
      orgId: ORG_ID,
      ticketCreatorId: null,
      guestEmail: null,
      excludeActorId: ACTOR_ID,
      includeClientContacts: true,
    });

    expect(recipients).toEqual(['resp@client.com']);
  });
});
