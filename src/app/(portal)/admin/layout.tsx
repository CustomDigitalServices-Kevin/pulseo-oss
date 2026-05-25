import { ReactNode } from 'react';
import { getSession, isUserAdmin } from '@/lib/auth/session';
import { redirect } from 'next/navigation';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await getSession();

  if (!session) {
    redirect('/login');
  }

  const admin = await isUserAdmin(session.user.id);
  if (!admin) {
    redirect('/login');
  }

  return <>{children}</>;
}
