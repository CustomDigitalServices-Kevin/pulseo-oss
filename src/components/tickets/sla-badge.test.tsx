import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SlaBadge } from './sla-badge';

// Reference "now" used across tests so the rendered output is deterministic
// regardless of system clock. The component plumbs `now` down to
// `computeSlaStatus`, which is pure given this reference.
const NOW = new Date('2026-04-10T12:00:00Z');

describe('<SlaBadge />', () => {
  it('renders nothing when there is no SLA', () => {
    const { container } = render(
      <SlaBadge
        createdAt="2026-04-10T12:00:00Z"
        resolutionDueAt={null}
        closedAt={null}
        now={NOW}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows on_time when plenty of time remains', () => {
    render(
      <SlaBadge
        createdAt="2026-04-10T11:00:00Z"
        resolutionDueAt="2026-04-12T11:00:00Z"
        closedAt={null}
        now={NOW}
      />
    );
    expect(screen.getByText(/restantes/i)).toBeInTheDocument();
  });

  it('shows met when closed before due date', () => {
    render(
      <SlaBadge
        createdAt="2026-04-09T08:00:00Z"
        resolutionDueAt="2026-04-09T20:00:00Z"
        closedAt="2026-04-09T16:00:00Z"
        now={NOW}
      />
    );
    expect(screen.getByText(/respect/i)).toBeInTheDocument();
  });

  it('shows overdue when closed after due', () => {
    render(
      <SlaBadge
        createdAt="2026-04-09T08:00:00Z"
        resolutionDueAt="2026-04-09T12:00:00Z"
        closedAt="2026-04-09T18:00:00Z"
        now={NOW}
      />
    );
    expect(screen.getByText(/Dépassé/i)).toBeInTheDocument();
  });

  it('hides label in iconOnly mode but still renders the badge', () => {
    render(
      <SlaBadge
        createdAt="2026-04-10T11:00:00Z"
        resolutionDueAt="2026-04-12T11:00:00Z"
        closedAt={null}
        iconOnly
        now={NOW}
      />
    );
    // Label is hidden but the badge wrapper still renders (accessible via title)
    expect(screen.queryByText(/restantes/)).not.toBeInTheDocument();
  });

  it('accepts Date objects in addition to strings', () => {
    const created = new Date('2026-04-10T11:00:00Z');
    const due = new Date('2026-04-12T11:00:00Z');
    render(
      <SlaBadge createdAt={created} resolutionDueAt={due} closedAt={null} now={NOW} />
    );
    expect(screen.getByText(/restantes/i)).toBeInTheDocument();
  });

  it('shows at_risk when under 25% of the SLA window remains', () => {
    // Window: 24h; 5h left = ~21% remaining → at_risk
    const created = new Date('2026-04-10T00:00:00Z');
    const due = new Date('2026-04-11T00:00:00Z');
    const now = new Date('2026-04-10T19:00:00Z');
    render(
      <SlaBadge createdAt={created} resolutionDueAt={due} closedAt={null} now={now} />
    );
    expect(screen.getByText(/risque/i)).toBeInTheDocument();
  });

  it('shows overdue for an open ticket past its due date', () => {
    const created = new Date('2026-04-10T00:00:00Z');
    const due = new Date('2026-04-10T06:00:00Z');
    const now = new Date('2026-04-10T12:00:00Z');
    render(
      <SlaBadge createdAt={created} resolutionDueAt={due} closedAt={null} now={now} />
    );
    expect(screen.getByText(/En retard/i)).toBeInTheDocument();
  });
});
