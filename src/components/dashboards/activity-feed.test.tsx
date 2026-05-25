import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

// `vi.mock` calls are hoisted above imports. To share a mock function between
// the factory and the test body, use `vi.hoisted`.
const { executeMock, loggerWarnMock } = vi.hoisted(() => ({
  executeMock: vi.fn(),
  loggerWarnMock: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    execute: executeMock,
  },
}));

// The component uses drizzle-orm's `sql` tag — mock it to a no-op so we don't
// need drizzle in this test. Our executeMock ignores args anyway.
vi.mock('drizzle-orm', () => ({
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: loggerWarnMock,
    error: vi.fn(),
  },
}));

import ActivityFeed from './activity-feed';

beforeEach(() => {
  executeMock.mockReset();
  loggerWarnMock.mockReset();
});

describe('<ActivityFeed />', () => {
  it('renders a row per event with a human label and deep link where applicable', async () => {
    executeMock.mockResolvedValueOnce({
      rows: [
        {
          id: 'ev-1',
          event_type: 'ticket_created',
          created_at: new Date(Date.now() - 5 * 60_000).toISOString(),
          resource_id: 'tk-1',
          user_email: 'alice@acme.io',
          ticket_number: 42,
          ticket_title: 'Printer broken',
          org_slug: 'acme',
        },
        {
          id: 'ev-2',
          event_type: 'login',
          created_at: new Date(Date.now() - 2 * 3_600_000).toISOString(),
          resource_id: null,
          user_email: 'bob@acme.io',
          ticket_number: null,
          ticket_title: null,
          org_slug: null,
        },
      ],
    });

    // RSC-style invocation: component is async, returns JSX.
    const ui = await ActivityFeed({ scope: { type: 'global' } });
    const { container, getAllByText } = render(ui);

    // With the next-intl mock, the message keys (activityTicketCreated /
    // activityLogin) are echoed verbatim — the `{who}` params are substituted
    // only when the source string is the literal template, but here the key
    // IS the template (no params in the key itself). So we assert the keys
    // appear for each event type.
    expect(getAllByText('activityTicketCreated').length).toBeGreaterThanOrEqual(1);
    expect(getAllByText('activityLogin').length).toBeGreaterThanOrEqual(1);
    // The ticket_created event links to the ticket deep link.
    const tkLink = container.querySelector('a[href="/clients/acme/tickets/tk-1"]');
    expect(tkLink).not.toBeNull();
  });

  it('renders an empty state when no events are returned', async () => {
    executeMock.mockResolvedValueOnce({ rows: [] });
    const ui = await ActivityFeed({ scope: { type: 'global' } });
    const { getByText } = render(ui);
    // next-intl mock echoes keys → `t('activityEmpty')` renders "activityEmpty".
    expect(getByText('activityEmpty')).toBeInTheDocument();
  });

  it('calls db.execute once per invocation', async () => {
    executeMock.mockResolvedValueOnce({ rows: [] });
    await ActivityFeed({ scope: { type: 'org', id: 'org-123' } });
    expect(executeMock).toHaveBeenCalledTimes(1);
  });

  it('degrades gracefully when the row shape fails Zod validation', async () => {
    // Schema drift — a column is missing / typed wrong.
    executeMock.mockResolvedValueOnce({
      rows: [
        {
          id: 'ev-bad',
          event_type: 'ticket_created',
          // `created_at` missing entirely — triggers schema mismatch.
          resource_id: 'tk-1',
          user_email: 'x@y.io',
          ticket_number: 'not-a-number', // wrong type
          ticket_title: null,
          org_slug: 'acme',
        },
      ],
    });
    const ui = await ActivityFeed({ scope: { type: 'global' } });
    const { getByText } = render(ui);
    // Graceful fallback: empty state instead of crash.
    // next-intl mock echoes keys → `t('activityEmpty')` renders "activityEmpty".
    expect(getByText('activityEmpty')).toBeInTheDocument();
    // And a warn log is emitted so ops can notice.
    expect(loggerWarnMock).toHaveBeenCalledOnce();
    expect(loggerWarnMock.mock.calls[0][0]).toMatch(/ACTIVITY-FEED/);
  });
});
