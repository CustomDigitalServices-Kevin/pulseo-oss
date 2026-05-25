import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KpiCard } from './kpi-card';

describe('<KpiCard />', () => {
  it('renders label and value', () => {
    render(<KpiCard label="Tickets ouverts" value={42} />);
    expect(screen.getByText('Tickets ouverts')).toBeInTheDocument();
    // French locale: 42 stays "42"; test with a larger number too below.
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('formats numeric values in fr-FR locale by default', () => {
    render(<KpiCard label="Total" value={1234} />);
    // fr-FR uses NBSP or narrow-NBSP thousands sep depending on ICU — match either.
    // Use getAllByText to tolerate ancestor nodes having the same textContent,
    // then assert at least one concrete match exists.
    const found = screen.getAllByText(
      (_, node) => !!node && node.tagName === 'P' && /1[\s\u00A0\u202F]234/.test(node.textContent ?? ''),
    );
    expect(found.length).toBeGreaterThanOrEqual(1);
  });

  it('renders as a Link when href is provided', () => {
    render(<KpiCard label="Foo" value={1} href="/admin/dashboard" />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/admin/dashboard');
  });

  it('does not render as a Link when href is omitted', () => {
    render(<KpiCard label="Foo" value={1} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders a positive delta with an uptrend class', () => {
    const { container } = render(
      <KpiCard label="Foo" value={10} delta={{ value: 12, unit: '%' }} />
    );
    expect(screen.getByText(/\+12/)).toBeInTheDocument();
    // Positive delta carries a success-colored className fragment.
    expect(container.querySelector('[data-delta-sign="up"]')).not.toBeNull();
  });

  it('renders a negative delta with a downtrend marker', () => {
    const { container } = render(
      <KpiCard label="Foo" value={10} delta={{ value: -4, unit: 'pts' }} />
    );
    expect(screen.getByText(/-4/)).toBeInTheDocument();
    expect(container.querySelector('[data-delta-sign="down"]')).not.toBeNull();
  });

  it('renders a sparkline SVG when data is provided', () => {
    const spark = [
      { date: '2025-01-01', count: 1 },
      { date: '2025-01-02', count: 3 },
      { date: '2025-01-03', count: 2 },
    ];
    const { container } = render(
      <KpiCard label="Tickets" value={6} sparkline={spark} />
    );
    // Recharts renders an SVG root — the simplest load-bearing check.
    expect(container.querySelector('svg')).not.toBeNull();
  });
});
