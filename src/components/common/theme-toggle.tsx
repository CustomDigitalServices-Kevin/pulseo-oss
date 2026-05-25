'use client';

import { useTheme } from 'next-themes';
import { useTranslations } from 'next-intl';
import { Sun, Moon, Monitor } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * Theme toggle button (light / dark / system) for the header.
 * Uses next-themes which is already a dependency.
 */
export function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme();
  const t = useTranslations('common2');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex items-center justify-center w-9 h-9 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        aria-label={t('themeToggle')}
      >
        <Sun className="w-4 h-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
        <Moon className="absolute w-4 h-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem onClick={() => setTheme('light')} className="gap-2">
          <Sun className="w-4 h-4" />
          {t('themeLight')}
          {resolvedTheme === 'light' && (
            <span className="ml-auto text-xs text-muted-foreground">●</span>
          )}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('dark')} className="gap-2">
          <Moon className="w-4 h-4" />
          {t('themeDark')}
          {resolvedTheme === 'dark' && (
            <span className="ml-auto text-xs text-muted-foreground">●</span>
          )}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('system')} className="gap-2">
          <Monitor className="w-4 h-4" />
          {t('themeSystem')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
