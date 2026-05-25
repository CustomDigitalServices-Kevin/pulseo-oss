'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ComponentProps } from 'react';

/**
 * Theme provider for Pulseo.
 *
 * Dark theme is the default and the currently-polished palette. Light is
 * supported (basic tokens exist) but the dark design system is the primary
 * one. The user's choice (light / dark / system) is persisted via
 * next-themes using the `class` strategy on `<html>`.
 */
export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
