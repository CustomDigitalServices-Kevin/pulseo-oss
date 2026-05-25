import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AddMemberModal } from './add-member-modal';

const noopResolved = vi.fn().mockResolvedValue({ ok: true });

function baseProps(
  actor: { role: 'admin' | 'gestionnaire' | 'viewer' | null; isSuperadmin: boolean },
) {
  return {
    open: true,
    onOpenChange: vi.fn(),
    actor,
    onSubmitDirect: noopResolved,
  };
}

// With the next-intl mock, t('modalXxx') returns the literal key "modalXxx"
// (params like {name} are substituted when present in the key, but most
// simple keys carry no params). We assert the keys instead of FR strings.

describe('<AddMemberModal />', () => {
  it('shows "Ajout impossible" when actor has no allowed roles (viewer)', () => {
    render(<AddMemberModal {...baseProps({ role: 'viewer', isSuperadmin: false })} />);
    expect(screen.getByText('modalCannotAddTitle')).toBeInTheDocument();
    expect(screen.getByText('modalCannotAddDesc')).toBeInTheDocument();
  });

  it('renders email input and role select for admin', () => {
    render(<AddMemberModal {...baseProps({ role: 'admin', isSuperadmin: false })} />);
    expect(screen.getByLabelText('modalEmailLabel')).toBeInTheDocument();
    expect(screen.getByLabelText('modalRoleLabel')).toBeInTheDocument();
    // Direct-mode submit button
    expect(screen.getByRole('button', { name: 'modalAdd' })).toBeInTheDocument();
  });

  it('shows email validation error on submit with invalid email', async () => {
    render(<AddMemberModal {...baseProps({ role: 'admin', isSuperadmin: false })} />);
    const emailInput = screen.getByLabelText('modalEmailLabel');
    fireEvent.change(emailInput, { target: { value: 'not-an-email' } });
    fireEvent.click(screen.getByRole('button', { name: 'modalAdd' }));
    await waitFor(() => {
      // Zod error messages are raw FR strings from the component's own schema,
      // not i18n keys — still "Email invalide".
      expect(screen.getByText(/email invalide/i)).toBeInTheDocument();
    });
  });

  it('hides mode tabs for non-superadmin', () => {
    render(<AddMemberModal {...baseProps({ role: 'admin', isSuperadmin: false })} />);
    expect(screen.queryByRole('tablist', { name: 'modalModeAria' })).not.toBeInTheDocument();
  });

  it('shows mode tabs for superadmin with teams', () => {
    const onSubmitTeam = vi.fn().mockResolvedValue({ ok: true });
    render(
      <AddMemberModal
        {...baseProps({ role: null, isSuperadmin: true })}
        teams={[{ id: 't-1', name: 'Beta' }]}
        onSubmitTeam={onSubmitTeam}
      />,
    );
    expect(screen.getByRole('tablist', { name: 'modalModeAria' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'modalAddDirect' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'viaTeam' })).toBeInTheDocument();
  });

  it('hides mode tabs for superadmin when teams is empty', () => {
    render(
      <AddMemberModal
        {...baseProps({ role: null, isSuperadmin: true })}
        teams={[]}
        onSubmitTeam={vi.fn().mockResolvedValue({ ok: true })}
      />,
    );
    expect(screen.queryByRole('tablist', { name: 'modalModeAria' })).not.toBeInTheDocument();
  });

  it('switches to team mode when "Via équipe" tab clicked', () => {
    render(
      <AddMemberModal
        {...baseProps({ role: null, isSuperadmin: true })}
        teams={[{ id: 't-1', name: 'Beta' }]}
        onSubmitTeam={vi.fn().mockResolvedValue({ ok: true })}
      />,
    );
    const teamTab = screen.getByRole('tab', { name: 'viaTeam' });
    fireEvent.click(teamTab);
    expect(teamTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('modalTeamLabel')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'modalAddViaTeamBtn' })).toBeInTheDocument();
  });

  it('calls onOpenChange(false) on cancel click', () => {
    const onOpenChange = vi.fn();
    render(
      <AddMemberModal
        {...baseProps({ role: 'admin', isSuperadmin: false })}
        onOpenChange={onOpenChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'modalCancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows hint about inferior roles for non-superadmin', () => {
    render(<AddMemberModal {...baseProps({ role: 'gestionnaire', isSuperadmin: false })} />);
    expect(screen.getByText('modalRoleHint')).toBeInTheDocument();
  });

  it('does not show the "inferior roles" hint for superadmin', () => {
    render(
      <AddMemberModal {...baseProps({ role: null, isSuperadmin: true })} />,
    );
    expect(screen.queryByText('modalRoleHint')).not.toBeInTheDocument();
  });
});
