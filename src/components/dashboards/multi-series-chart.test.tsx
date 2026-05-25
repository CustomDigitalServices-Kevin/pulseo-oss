import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MultiSeriesChart } from './multi-series-chart';

// Recharts ResponsiveContainer needs measurable parent dimensions.
// jsdom doesn't layout CSS, so we force fixed dimensions via an inline style.
function SizedWrapper({ children }: { children: ReactNode }) {
  return <div style={{ width: 600, height: 300 }}>{children}</div>;
}

describe('<MultiSeriesChart />', () => {
  it('mounts without error when given empty series', () => {
    const { container } = render(<MultiSeriesChart series={[]} />, {
      wrapper: SizedWrapper,
    });
    // Empty-state branch renders a placeholder string — no SVG required.
    expect(container.firstChild).not.toBeNull();
  });

  it('renders an SVG when given populated series', () => {
    const series = [
      {
        label: 'Org A',
        slug: 'org-a',
        color: 'oklch(0.625 0.205 264)',
        data: [
          { date: '2025-01-01', count: 2 },
          { date: '2025-01-02', count: 5 },
        ],
      },
      {
        label: 'Org B',
        slug: 'org-b',
        color: 'oklch(0.700 0.165 155)',
        data: [
          { date: '2025-01-01', count: 1 },
          { date: '2025-01-02', count: 3 },
        ],
      },
    ];
    const { container } = render(<MultiSeriesChart series={series} />, {
      wrapper: SizedWrapper,
    });
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('renders the Y-axis label text when yLabel is provided', () => {
    const series = [
      {
        label: 'Org A',
        slug: 'org-a',
        color: 'oklch(0.625 0.205 264)',
        data: [
          { date: '2025-01-01', count: 2 },
          { date: '2025-01-02', count: 5 },
        ],
      },
    ];
    const { container } = render(
      <MultiSeriesChart series={series} yLabel="Tickets" />,
      { wrapper: SizedWrapper },
    );
    // Recharts renders axis labels inside a <text> node within the SVG —
    // checking the aggregate textContent is the most stable signal.
    expect(container.textContent ?? '').toMatch(/Tickets/);
  });

  it('renders without error when stacked is true (smoke)', () => {
    // Recharts internals don't expose stackId in the DOM; the contract we
    // verify here is "the component still renders an SVG with both series
    // when stacked is enabled" — ensures the new prop path doesn't throw.
    const series = [
      {
        label: 'Créés',
        slug: 'created',
        color: 'oklch(0.625 0.205 264)',
        data: [
          { date: '2025-01-01', count: 2 },
          { date: '2025-01-02', count: 5 },
        ],
      },
      {
        label: 'Résolus',
        slug: 'resolved',
        color: 'oklch(0.700 0.165 155)',
        data: [
          { date: '2025-01-01', count: 1 },
          { date: '2025-01-02', count: 4 },
        ],
      },
    ];
    const { container } = render(
      <MultiSeriesChart series={series} stacked />,
      { wrapper: SizedWrapper },
    );
    expect(container.querySelector('svg')).not.toBeNull();
  });
});
