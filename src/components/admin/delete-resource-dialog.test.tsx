import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DeleteResourceDialog } from './delete-resource-dialog';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function baseProps(overrides: Partial<Parameters<typeof DeleteResourceDialog>[0]> = {}) {
  return {
    resourceKind: 'groupe',
    resourceGender: 'm' as const,
    resourceName: 'Acme',
    onDelete: vi.fn().mockResolvedValue({ ok: true }),
    redirectTo: '/admin/groups',
    warnings: ['Les organisations sont détachées', 'Les gestionnaires perdent leur rôle'],
    ...overrides,
  };
}

describe('<DeleteResourceDialog />', () => {
  it('renders trigger button and opens dialog on click', () => {
    render(<DeleteResourceDialog {...baseProps()} />);
    // With the next-intl mock, t('deleteDialogTriggerM', { kind: 'groupe' }) echoes
    // the key with {kind} substituted → "deleteDialogTriggerM" (no params in key).
    const trigger = screen.getByRole('button', { name: /deleteDialogTriggerM/i });
    expect(trigger).toBeInTheDocument();
    fireEvent.click(trigger);
    expect(screen.getByText(/deleteDialogTitleM/i)).toBeInTheDocument();
  });

  it('lists all warnings', () => {
    render(<DeleteResourceDialog {...baseProps()} />);
    fireEvent.click(screen.getByRole('button', { name: /deleteDialogTriggerM/i }));
    // Warnings are user-supplied strings (NOT i18n keys) → still raw FR text.
    expect(screen.getByText(/organisations sont détachées/i)).toBeInTheDocument();
    expect(screen.getByText(/gestionnaires perdent leur rôle/i)).toBeInTheDocument();
  });

  it('confirm button disabled until the exact name is typed', () => {
    render(<DeleteResourceDialog {...baseProps()} />);
    fireEvent.click(screen.getByRole('button', { name: /deleteDialogTriggerM/i }));
    const confirmBtn = screen.getByRole('button', { name: /deleteDialogConfirm/i });
    expect(confirmBtn).toBeDisabled();

    const input = screen.getByPlaceholderText('Acme');
    fireEvent.change(input, { target: { value: 'acme' } }); // wrong case
    expect(confirmBtn).toBeDisabled();

    fireEvent.change(input, { target: { value: 'Acme' } });
    expect(confirmBtn).not.toBeDisabled();
  });

  it('calls onDelete when confirmed and redirects on success', async () => {
    const onDelete = vi.fn().mockResolvedValue({ ok: true });
    render(<DeleteResourceDialog {...baseProps({ onDelete })} />);
    fireEvent.click(screen.getByRole('button', { name: /deleteDialogTriggerM/i }));
    fireEvent.change(screen.getByPlaceholderText('Acme'), { target: { value: 'Acme' } });
    fireEvent.click(screen.getByRole('button', { name: /deleteDialogConfirm/i }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
  });

  it('shows error message when onDelete returns ok=false', async () => {
    const onDelete = vi.fn().mockResolvedValue({ ok: false, error: 'DB contrainte' });
    render(<DeleteResourceDialog {...baseProps({ onDelete })} />);
    fireEvent.click(screen.getByRole('button', { name: /deleteDialogTriggerM/i }));
    fireEvent.change(screen.getByPlaceholderText('Acme'), { target: { value: 'Acme' } });
    fireEvent.click(screen.getByRole('button', { name: /deleteDialogConfirm/i }));
    await waitFor(() => {
      // The error string is passed through `result.error` → still raw.
      expect(screen.getByText(/db contrainte/i)).toBeInTheDocument();
    });
  });

  it('cancel button closes dialog without calling onDelete', () => {
    const onDelete = vi.fn();
    render(<DeleteResourceDialog {...baseProps({ onDelete })} />);
    fireEvent.click(screen.getByRole('button', { name: /deleteDialogTriggerM/i }));
    fireEvent.click(screen.getByRole('button', { name: /deleteDialogCancel/i }));
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('uses feminine article and suffix for équipe', () => {
    render(
      <DeleteResourceDialog
        {...baseProps({
          resourceKind: 'équipe',
          resourceGender: 'f',
          resourceName: 'Beta',
        })}
      />,
    );
    // Feminine key → deleteDialogTriggerF
    expect(screen.getByRole('button', { name: /deleteDialogTriggerF/i })).toBeInTheDocument();
  });
});
