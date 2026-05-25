'use client';

import { ReactNode, useEffect } from 'react';

interface BrandingProviderProps {
  children: ReactNode;
  colorPrimary: string;
  colorSecondary: string;
  orgName: string;
}

export function BrandingProvider({
  children,
  colorPrimary,
  colorSecondary,
  orgName,
}: BrandingProviderProps) {
  useEffect(() => {
    document.documentElement.style.setProperty('--color-org-primary', colorPrimary);
    document.documentElement.style.setProperty('--color-org-secondary', colorSecondary);
    document.title = `${orgName} - Pulseo`;

    return () => {
      document.documentElement.style.removeProperty('--color-org-primary');
      document.documentElement.style.removeProperty('--color-org-secondary');
    };
  }, [colorPrimary, colorSecondary, orgName]);

  return <>{children}</>;
}
