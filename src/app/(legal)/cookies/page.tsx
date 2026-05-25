import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Cookies',
  description: 'Liste exhaustive des cookies techniques utilisés par Pulseo et exemption CNIL.',
};

export default function CookiesPage() {
  return (
    <article className="prose-legal">
      <h1 className="text-[28px] font-semibold tracking-tight text-foreground mb-2">
        Politique cookies
      </h1>
      <p className="text-foreground-subtle text-[13px] mb-8">
        Pulseo utilise <strong>uniquement des cookies techniques</strong> nécessaires au
        fonctionnement du service, exempts de consentement préalable au sens de l&apos;article 82
        de la loi Informatique et Libertés (lignes directrices CNIL du 17 septembre 2020).
      </p>

      <Section title="Pourquoi pas de bandeau de consentement ?">
        <p>
          La CNIL exempte de consentement les cookies qui ont pour finalité exclusive de permettre
          ou faciliter la communication par voie électronique, ou qui sont strictement nécessaires
          à la fourniture d&apos;un service de communication en ligne expressément demandé par
          l&apos;utilisateur. Pulseo n&apos;utilise{' '}
          <strong>aucun traceur publicitaire, aucune mesure d&apos;audience tierce, aucun cookie
          tiers de partage social</strong>.
        </p>
        <p>
          Une bannière d&apos;<em>information</em> (non bloquante) s&apos;affiche au premier accès
          pour vous informer en toute transparence.
        </p>
      </Section>

      <Section title="Liste exhaustive des cookies déposés">
        <CookieRow
          name="better-auth.session_token"
          purpose="Maintien de votre session après authentification (lien magique)"
          duration="30 jours (HttpOnly, Secure, SameSite=Lax)"
          legal="Strictement nécessaire au service — exempt art. 82 LIL"
          provider="Pulseo (Better Auth)"
        />
        <CookieRow
          name="pulseo_locale"
          purpose="Mémoriser votre langue préférée (français / anglais)"
          duration="1 an (SameSite=Lax)"
          legal="Préférence utilisateur — exempt art. 82 LIL"
          provider="Pulseo"
        />
        <CookieRow
          name="pulseo_cookie_ack"
          purpose="Mémoriser que vous avez fermé la bannière d'information cookies"
          duration="Persistant (stockage localStorage, pas un cookie HTTP)"
          legal="Préférence UI locale — hors champ art. 82 (pas envoyé au serveur)"
          provider="Pulseo (navigateur uniquement)"
        />
      </Section>

      <Section title="Aucun traceur tiers">
        <p>
          Pulseo n&apos;intègre aucune des technologies suivantes :
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Google Analytics, Matomo, Plausible ou autre mesure d&apos;audience</li>
          <li>Pixels publicitaires (Meta, Google Ads, LinkedIn Insight Tag)</li>
          <li>Boutons de partage tiers (Twitter, Facebook, LinkedIn) avec cookies actifs</li>
          <li>Chat support tiers avec cookies de fingerprinting</li>
          <li>CDN tiers déposant des cookies (les ressources Pulseo sont servies depuis le même
            domaine)</li>
        </ul>
      </Section>

      <Section title="Comment supprimer les cookies ?">
        <p>
          Vous pouvez à tout moment supprimer les cookies déposés par Pulseo via les paramètres de
          votre navigateur :
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Chrome</strong> : Paramètres → Confidentialité et sécurité → Cookies et autres
            données des sites
          </li>
          <li>
            <strong>Firefox</strong> : Paramètres → Vie privée et sécurité → Cookies et données de
            sites
          </li>
          <li>
            <strong>Safari</strong> : Préférences → Confidentialité → Gérer les données de site web
          </li>
        </ul>
        <p>
          La suppression du cookie <code>better-auth.session_token</code> vous déconnectera ; vous
          devrez vous reconnecter via un nouveau lien magique.
        </p>
      </Section>

      <Section title="Mise à jour de cette page">
        <p>
          Cette page est tenue à jour à chaque évolution technique de Pulseo. Dernière vérification :
          25 avril 2026.
        </p>
      </Section>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-[18px] font-semibold text-foreground mb-3 pb-2 border-b border-border">
        {title}
      </h2>
      <div className="space-y-3 text-[14px] text-foreground-muted leading-relaxed">{children}</div>
    </section>
  );
}

function CookieRow({
  name,
  purpose,
  duration,
  legal,
  provider,
}: {
  name: string;
  purpose: string;
  duration: string;
  legal: string;
  provider: string;
}) {
  return (
    <div className="rounded-md border border-border p-3 space-y-1.5">
      <p>
        <code className="text-[13px] font-mono px-1.5 py-0.5 rounded bg-canvas/60 border border-border text-foreground">
          {name}
        </code>
        <span className="text-foreground-subtle text-[12px] ml-2">· {provider}</span>
      </p>
      <Field label="Finalité">{purpose}</Field>
      <Field label="Durée">{duration}</Field>
      <Field label="Base">{legal}</Field>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[80px_1fr] gap-x-3 text-[13px]">
      <span className="text-foreground-subtle">{label}</span>
      <span>{children}</span>
    </div>
  );
}
