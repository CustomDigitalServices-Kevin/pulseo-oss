import { redirect } from 'next/navigation';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { requireSession } from '@/lib/auth/session';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { ProfileIdentityForm } from '@/components/profile/profile-identity-form';
import { ProfileEmailForm } from '@/components/profile/profile-email-form';
import { ProfilePasswordForm } from '@/components/profile/profile-password-form';
import { ProfileLocaleForm } from '@/components/profile/profile-locale-form';
import { Globe, KeyRound, Mail, User } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import type { SupportedLocale } from '@/lib/validations/profile';

export const dynamic = 'force-dynamic';

export default async function MyProfilePage() {
  const session = await requireSession();
  const t = await getTranslations('profile');

  const user = await db.query.users.findFirst({
    where: (u, { eq }) => eq(u.id, session.user.id),
  });
  if (!user) redirect('/login');

  // Déduit si l'user a un password en inspectant la table `accounts` Better
  // Auth : un row avec providerId='credential' indique qu'un password est
  // défini. Magic-link only = pas de row credential.
  const creds = await db.query.accounts.findMany({
    where: (a, { and, eq }) =>
      and(eq(a.userId, user.id), eq(a.providerId, 'credential')),
  });
  const hasPassword = creds.some((c) => c.password != null);

  const currentLocale: SupportedLocale =
    user.locale === 'en' ? 'en' : 'fr';

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto animate-in">
      <header className="mb-8">
        <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-foreground">
          {t('title')}
        </h1>
        <p className="text-[15px] text-foreground-muted mt-1">
          {t('subtitle')}
        </p>
      </header>

      <Tabs defaultValue="identity" className="!flex-row">
        <TabsList className="!h-auto flex-col w-52 shrink-0 bg-transparent gap-1 p-1 border border-border rounded-lg bg-elevated/40">
          <TabsTrigger
            value="identity"
            className="w-full justify-start gap-2 text-[13px]"
          >
            <User className="w-3.5 h-3.5" />
            {t('tabIdentity')}
          </TabsTrigger>
          <TabsTrigger
            value="email"
            className="w-full justify-start gap-2 text-[13px]"
          >
            <Mail className="w-3.5 h-3.5" />
            {t('tabEmail')}
          </TabsTrigger>
          <TabsTrigger
            value="password"
            className="w-full justify-start gap-2 text-[13px]"
          >
            <KeyRound className="w-3.5 h-3.5" />
            {t('tabPassword')}
          </TabsTrigger>
          <TabsTrigger
            value="locale"
            className="w-full justify-start gap-2 text-[13px]"
          >
            <Globe className="w-3.5 h-3.5" />
            {t('tabLocale')}
          </TabsTrigger>
        </TabsList>

        <div className="flex-1 min-w-0">
          <TabsContent
            value="identity"
            className="rounded-xl border border-border bg-elevated p-6"
          >
            <ProfileIdentityForm
              initial={{
                first_name: user.first_name,
                last_name: user.last_name,
                job_title: user.job_title,
                avatar_url: user.avatar_url,
                email: user.email,
              }}
            />
          </TabsContent>

          <TabsContent
            value="email"
            className="rounded-xl border border-border bg-elevated p-6"
          >
            <ProfileEmailForm currentEmail={user.email} />
          </TabsContent>

          <TabsContent
            value="password"
            className="rounded-xl border border-border bg-elevated p-6"
          >
            <ProfilePasswordForm hasPassword={hasPassword} />
          </TabsContent>

          <TabsContent
            value="locale"
            className="rounded-xl border border-border bg-elevated p-6"
          >
            <ProfileLocaleForm current={currentLocale} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
