'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { signIn } from '@/lib/auth/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Mail, CheckCircle2, KeyRound, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { Logo } from '@/components/common/logo';
import { cn } from '@/lib/utils';

type AuthMode = 'magic' | 'password';

export default function LoginPage() {
  const router = useRouter();
  const t = useTranslations('login');
  const [mode, setMode] = useState<AuthMode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setError(null);
  };

  const handleMagicLink = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const result = await signIn.magicLink({
        email,
        callbackURL: '/admin/dashboard',
      });

      if (result.error) {
        setError(result.error.message ?? t('magicLinkError'));
      } else {
        setSent(true);
      }
    } catch {
      setError(t('magicLinkGenericError'));
    } finally {
      setLoading(false);
    }
  };

  const handlePassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const result = await signIn.email({
        email,
        password,
        callbackURL: '/admin/dashboard',
      });

      if (result.error) {
        setError(result.error.message ?? t('invalidCredentials'));
      } else {
        router.push('/admin/dashboard');
        router.refresh();
      }
    } catch {
      setError(t('signInError'));
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="space-y-7 animate-in">
        {/* Mobile logo */}
        <div className="lg:hidden flex items-center gap-2.5 justify-center mb-4">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-premium-md overflow-hidden">
            <Logo variant="mark" size={22} markColor="#FAFAFA" />
          </div>
          <span className="text-lg font-semibold tracking-tight">Pulseo</span>
        </div>

        <div className="text-center space-y-5">
          <div className="relative w-16 h-16 mx-auto">
            <div className="absolute inset-0 rounded-2xl bg-[oklch(0.700_0.165_155)]/20 blur-xl" />
            <div className="relative w-16 h-16 rounded-2xl bg-[oklch(0.700_0.165_155)]/12 border border-[oklch(0.700_0.165_155)]/30 flex items-center justify-center">
              <CheckCircle2 className="w-7 h-7 text-[oklch(0.700_0.165_155)]" />
            </div>
          </div>
          <div className="space-y-2">
            <h2 className="text-[22px] font-semibold tracking-tight">{t('mailInboxCheck')}</h2>
            <p className="text-foreground-muted text-sm leading-relaxed">
              {t('linkSentTo')}
              <br />
              <strong className="text-foreground">{email}</strong>
            </p>
          </div>
          <Button
            variant="ghost"
            onClick={() => {
              setSent(false);
              setEmail('');
            }}
            className="text-xs text-foreground-muted hover:text-foreground hover:bg-elevated"
          >
            {t('useAnotherEmail')}
          </Button>
        </div>

        <div className="pt-5 border-t border-border">
          <p className="text-center text-[13px] text-foreground-subtle">
            {t('securedBy')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-7 animate-in">
      {/* Mobile logo */}
      <div className="lg:hidden flex items-center gap-2.5 justify-center mb-4">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-premium-md overflow-hidden">
          <Logo variant="mark" size={22} markColor="#FAFAFA" />
        </div>
        <span className="text-lg font-semibold tracking-tight">Pulseo</span>
      </div>

      <div className="space-y-1.5">
        <h2 className="text-[26px] font-semibold tracking-[-0.01em]">{t('welcomeBack')}</h2>
        <p className="text-foreground-muted text-sm">
          {mode === 'magic' ? t('subtitleMagic') : t('subtitlePassword')}
        </p>
      </div>

      {/* Mode toggle — premium tabs */}
      <div
        role="tablist"
        aria-label={t('methodAriaLabel')}
        className="grid grid-cols-2 gap-1 p-1 bg-elevated rounded-md border border-border"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'password'}
          onClick={() => switchMode('password')}
          className={cn(
            'flex items-center justify-center gap-2 h-8 rounded-[5px] text-xs font-medium transition-all duration-200',
            mode === 'password'
              ? 'bg-overlay text-foreground shadow-premium-sm border border-border-strong'
              : 'text-foreground-muted hover:text-foreground'
          )}
        >
          <KeyRound className="w-3.5 h-3.5" />
          {t('modePassword')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'magic'}
          onClick={() => switchMode('magic')}
          className={cn(
            'flex items-center justify-center gap-2 h-8 rounded-[5px] text-xs font-medium transition-all duration-200',
            mode === 'magic'
              ? 'bg-overlay text-foreground shadow-premium-sm border border-border-strong'
              : 'text-foreground-muted hover:text-foreground'
          )}
        >
          <Mail className="w-3.5 h-3.5" />
          {t('modeMagic')}
        </button>
      </div>

      {error && (
        <div className="p-3.5 bg-destructive/10 border border-destructive/30 text-destructive rounded-md text-sm flex items-start gap-2.5 animate-in">
          <span className="w-1 h-1 rounded-full bg-destructive mt-2 shrink-0" />
          <span className="leading-relaxed">{error}</span>
        </div>
      )}

      {mode === 'magic' ? (
        <form onSubmit={handleMagicLink} className="space-y-4 animate-in" key="magic">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs font-medium text-foreground-muted">
              {t('emailLabel')}
            </Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('emailPlaceholder')}
              required
              autoComplete="email"
              className="h-10 bg-elevated border-border focus-visible:border-primary/50"
            />
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full h-10 text-sm font-medium gap-2 group"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('magicLinkSending')}
              </>
            ) : (
              <>
                <Mail className="w-3.5 h-3.5" />
                {t('magicLinkCta')}
                <ArrowRight className="w-3.5 h-3.5 ml-0.5 group-hover:translate-x-0.5 transition-transform" />
              </>
            )}
          </Button>
        </form>
      ) : (
        <form onSubmit={handlePassword} className="space-y-4 animate-in" key="password">
          <div className="space-y-1.5">
            <Label htmlFor="email-pwd" className="text-xs font-medium text-foreground-muted">
              {t('emailLabel')}
            </Label>
            <Input
              id="email-pwd"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('emailPlaceholder')}
              required
              autoComplete="email"
              className="h-10 bg-elevated border-border focus-visible:border-primary/50"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-xs font-medium text-foreground-muted">
              {t('passwordLabel')}
            </Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('passwordPlaceholder')}
                required
                minLength={8}
                autoComplete="current-password"
                className="h-10 bg-elevated border-border focus-visible:border-primary/50 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? t('passwordHide') : t('passwordShow')}
                aria-pressed={showPassword}
                className="absolute inset-y-0 right-0 px-3 flex items-center text-foreground-subtle hover:text-foreground transition-colors focus-visible:outline-none focus-visible:text-foreground"
                tabIndex={-1}
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full h-10 text-sm font-medium gap-2 group"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('passwordSigningIn')}
              </>
            ) : (
              <>
                {t('passwordCta')}
                <ArrowRight className="w-3.5 h-3.5 ml-0.5 group-hover:translate-x-0.5 transition-transform" />
              </>
            )}
          </Button>
        </form>
      )}

      <div className="pt-5 border-t border-border">
        <p className="text-center text-[13px] text-foreground-subtle">
          {t('securedBy')}
        </p>
      </div>
    </div>
  );
}
