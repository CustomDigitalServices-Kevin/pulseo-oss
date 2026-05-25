'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { signOut } from '@/lib/auth/client';
import { Search, LogOut, UserCircle, Shield } from 'lucide-react';
import { NotificationsDropdown } from '@/components/common/notifications-dropdown';
import { ThemeToggle } from '@/components/common/theme-toggle';
import { HelpButton } from '@/components/tour/help-button';
import { Breadcrumbs } from '@/components/common/breadcrumbs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface HeaderNotification {
  id: string;
  title: string;
  description?: string;
  time: string;
  createdAt: string;
}

interface HeaderProps {
  userEmail: string;
  userName?: string | null;
  isAdmin?: boolean;
  notifications?: HeaderNotification[];
  /**
   * URL de l'avatar utilisateur (route API /api/avatars/[userId]). Si absent
   * ou non-trouvé en 404, fallback automatique sur les initiales.
   */
  avatarUrl?: string | null;
}

// Computed at render time on the client. Safe because this is a 'use client'
// component and we use suppressHydrationWarning on the kbd element to allow
// the server-rendered fallback ("Ctrl") to be replaced after hydration.
function detectIsMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  return navigator.platform.toLowerCase().includes('mac');
}

export function Header({ userEmail, userName, notifications, avatarUrl }: HeaderProps) {
  const router = useRouter();
  const t = useTranslations('header');
  const isMac = detectIsMac();

  const handleSignOut = async () => {
    await signOut({
      fetchOptions: {
        onSuccess: () => {
          router.push('/login');
        },
      },
    });
  };

  const triggerCommandPalette = () => {
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', metaKey: true, ctrlKey: true })
    );
  };

  const initials = userName
    ? userName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : userEmail[0].toUpperCase();

  return (
    <header className="h-14 border-b border-border bg-surface/80 backdrop-blur-xl sticky top-0 z-20">
      <div className="flex items-center justify-between gap-4 px-5 h-full">
        {/* Left: breadcrumbs */}
        <div className="hidden md:flex items-center min-w-0 flex-1">
          <Breadcrumbs />
        </div>

        {/* Center: command palette trigger */}
        <button
          type="button"
          onClick={triggerCommandPalette}
          className="hidden lg:flex items-center gap-2.5 px-3 h-8 min-w-[280px] rounded-md border border-border bg-elevated hover:bg-overlay hover:border-border-strong text-sm text-foreground-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          aria-label={t('commandPalette')}
        >
          <Search className="w-3.5 h-3.5" />
          <span className="flex-1 text-left text-xs">{t('commandPalette')}</span>
          <kbd
            className="text-[12px] font-mono font-medium tracking-wider bg-canvas border border-border rounded px-1.5 py-0.5 text-foreground-subtle"
            suppressHydrationWarning
          >
            {isMac ? '⌘' : 'Ctrl'} K
          </kbd>
        </button>

        {/* Right: help + theme + notifications + user dropdown */}
        <div className="flex items-center gap-1.5 shrink-0">
          <HelpButton />
          <ThemeToggle />
          <NotificationsDropdown notifications={notifications} />

          <div className="w-px h-5 bg-border mx-2" />

          <DropdownMenu>
            <DropdownMenuTrigger
              className="flex items-center gap-2 rounded-md pl-2 pr-1 py-1 hover:bg-overlay/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 transition-colors cursor-pointer"
              aria-label={t('userMenu')}
              data-tour-id="user-menu"
            >
              <div className="text-right hidden sm:block leading-tight">
                <p className="text-xs font-semibold">{userName ?? userEmail}</p>
                {userName && (
                  <p className="text-[13px] text-foreground-subtle mt-0.5">{userEmail}</p>
                )}
              </div>
              <div className="w-8 h-8 rounded-full overflow-hidden bg-primary/15 border border-primary/30 flex items-center justify-center text-[13px] font-semibold text-primary">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <span>{initials}</span>
                )}
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="px-2 py-1.5">
                <p className="text-[13px] font-medium truncate">
                  {userName ?? 'Mon compte'}
                </p>
                <p className="text-[12px] text-foreground-subtle truncate">
                  {userEmail}
                </p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                render={
                  <Link href="/me/profile" className="w-full cursor-pointer" />
                }
              >
                <UserCircle className="w-3.5 h-3.5" />
                {t('myProfile')}
              </DropdownMenuItem>
              <DropdownMenuItem
                render={
                  <Link href="/me/rgpd" className="w-full cursor-pointer" />
                }
              >
                <Shield className="w-3.5 h-3.5" />
                {t('myRgpd')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleSignOut}
                className="cursor-pointer text-destructive focus:text-destructive"
              >
                <LogOut className="w-3.5 h-3.5" />
                {t('signOut')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
