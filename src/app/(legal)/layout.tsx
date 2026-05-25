import Link from 'next/link';
import type { ReactNode } from 'react';
import { LegalFooter } from '@/components/legal/legal-footer';
import { Logo } from '@/components/common/logo';

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-canvas">
      <header className="border-b border-border bg-canvas/80 backdrop-blur supports-[backdrop-filter]:bg-canvas/60">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-2.5">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="relative w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-premium-md overflow-hidden">
              <Logo variant="mark" size={20} markColor="#FAFAFA" className="relative z-10" />
              <div className="absolute inset-0 rounded-lg ring-1 ring-inset ring-white/15" />
            </div>
            <span className="text-foreground font-semibold tracking-tight group-hover:text-primary transition-colors">
              Pulseo
            </span>
          </Link>
        </div>
      </header>
      <main className="flex-1 max-w-3xl w-full mx-auto px-6 py-10">{children}</main>
      <LegalFooter />
    </div>
  );
}
