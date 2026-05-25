import { describe, it, expect } from 'vitest';
import { hasMinRole, type Role } from './require-role';

describe('hasMinRole', () => {
  describe('viewer (rank 1)', () => {
    it('viewer satisfies viewer', () => {
      expect(hasMinRole('viewer', 'viewer')).toBe(true);
    });

    it('viewer does NOT satisfy gestionnaire', () => {
      expect(hasMinRole('viewer', 'gestionnaire')).toBe(false);
    });

    it('viewer does NOT satisfy admin', () => {
      expect(hasMinRole('viewer', 'admin')).toBe(false);
    });
  });

  describe('gestionnaire (rank 2)', () => {
    it('gestionnaire satisfies viewer', () => {
      expect(hasMinRole('gestionnaire', 'viewer')).toBe(true);
    });

    it('gestionnaire satisfies gestionnaire', () => {
      expect(hasMinRole('gestionnaire', 'gestionnaire')).toBe(true);
    });

    it('gestionnaire does NOT satisfy admin', () => {
      expect(hasMinRole('gestionnaire', 'admin')).toBe(false);
    });
  });

  describe('admin (rank 3)', () => {
    it('admin satisfies viewer', () => {
      expect(hasMinRole('admin', 'viewer')).toBe(true);
    });

    it('admin satisfies gestionnaire', () => {
      expect(hasMinRole('admin', 'gestionnaire')).toBe(true);
    });

    it('admin satisfies admin', () => {
      expect(hasMinRole('admin', 'admin')).toBe(true);
    });
  });

  describe('hierarchy invariants', () => {
    const roles: Role[] = ['viewer', 'gestionnaire', 'admin'];

    it('every role satisfies itself (reflexivity)', () => {
      for (const role of roles) {
        expect(hasMinRole(role, role)).toBe(true);
      }
    });

    it('admin satisfies every role (top of hierarchy)', () => {
      for (const role of roles) {
        expect(hasMinRole('admin', role)).toBe(true);
      }
    });

    it('viewer satisfies only viewer (bottom of hierarchy)', () => {
      expect(hasMinRole('viewer', 'viewer')).toBe(true);
      expect(hasMinRole('viewer', 'gestionnaire')).toBe(false);
      expect(hasMinRole('viewer', 'admin')).toBe(false);
    });
  });
});
