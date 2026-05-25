import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Breadcrumbs } from './breadcrumbs';

const usePathnameMock = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => usePathnameMock(),
}));

describe('<Breadcrumbs />', () => {
  beforeEach(() => {
    usePathnameMock.mockReset();
  });

  it('returns null on root path', () => {
    usePathnameMock.mockReturnValue('/');
    const { container } = render(<Breadcrumbs />);
    expect(container.firstChild).toBeNull();
  });

  it('humanizes known segments to French labels', () => {
    usePathnameMock.mockReturnValue('/admin/dashboard');
    render(<Breadcrumbs />);
    // next-intl mock echoes keys. Breadcrumbs uses the `common2` namespace.
    expect(screen.getByText('breadcrumbAdmin')).toBeInTheDocument();
    expect(screen.getByText('breadcrumbDashboard')).toBeInTheDocument();
  });

  it('renders Tickets label for the tickets segment', () => {
    usePathnameMock.mockReturnValue('/clients/acme/tickets');
    render(<Breadcrumbs />);
    expect(screen.getByText('breadcrumbTickets')).toBeInTheDocument();
  });

  it('replaces UUID-like segments with "Détail"', () => {
    usePathnameMock.mockReturnValue(
      '/clients/acme/tickets/550e8400-e29b-41d4-a716-446655440000'
    );
    render(<Breadcrumbs />);
    expect(screen.getByText('breadcrumbDetail')).toBeInTheDocument();
  });

  it('uses currentLabel override on the last segment', () => {
    usePathnameMock.mockReturnValue('/clients/acme/tickets/123abc');
    render(<Breadcrumbs currentLabel="Bug critique production" />);
    expect(screen.getByText('Bug critique production')).toBeInTheDocument();
  });

  it('renders intermediate crumbs as links', () => {
    usePathnameMock.mockReturnValue('/admin/dashboard');
    render(<Breadcrumbs />);
    const adminLink = screen.getByRole('link', { name: 'breadcrumbAdmin' });
    expect(adminLink).toHaveAttribute('href', '/admin');
  });

  it('the last crumb is not a link', () => {
    usePathnameMock.mockReturnValue('/admin/dashboard');
    render(<Breadcrumbs />);
    expect(
      screen.queryByRole('link', { name: 'breadcrumbDashboard' })
    ).not.toBeInTheDocument();
  });

  it('capitalizes unknown segments', () => {
    usePathnameMock.mockReturnValue('/random');
    render(<Breadcrumbs />);
    expect(screen.getByText('Random')).toBeInTheDocument();
  });
});
