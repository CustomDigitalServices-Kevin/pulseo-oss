import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Inbox } from 'lucide-react';
import { EmptyState } from './empty-state';

describe('<EmptyState />', () => {
  it('renders title and icon', () => {
    render(<EmptyState icon={Inbox} title="Aucun ticket" />);
    expect(screen.getByText('Aucun ticket')).toBeInTheDocument();
  });

  it('renders the optional description', () => {
    render(
      <EmptyState
        icon={Inbox}
        title="Vide"
        description="Créez votre premier élément"
      />
    );
    expect(screen.getByText('Créez votre premier élément')).toBeInTheDocument();
  });

  it('does not render description when omitted', () => {
    render(<EmptyState icon={Inbox} title="Vide" />);
    // Title is the only text content of any importance
    expect(screen.queryByText('Créez votre premier élément')).not.toBeInTheDocument();
  });

  it('renders a CTA link when action.href is provided', () => {
    render(
      <EmptyState
        icon={Inbox}
        title="Vide"
        action={{ label: 'Créer', href: '/new' }}
      />
    );
    const link = screen.getByRole('link', { name: 'Créer' });
    expect(link).toHaveAttribute('href', '/new');
  });

  it('renders a CTA button when action.onClick is provided', () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        icon={Inbox}
        title="Vide"
        action={{ label: 'Action', onClick }}
      />
    );
    const button = screen.getByRole('button', { name: 'Action' });
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('does not render any CTA when action is omitted', () => {
    render(<EmptyState icon={Inbox} title="Vide" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
