import type { Metadata } from 'next';
import { appConfig } from '@/config/app-config';

export const metadata: Metadata = {
  title: 'Mentions légales',
  description: `Mentions légales du portail ${appConfig.name}.`,
};

/**
 * Generic legal-mentions template.
 *
 * This page is intentionally fed by `appConfig` so anyone forking Pulseo
 * exposes their own company information out of the box. The structure
 * follows the French LCEN (loi n° 2004-575 du 21 juin 2004) — adjust the
 * sections to match your jurisdiction.
 *
 * Override the following env vars in your `.env`:
 *   NEXT_PUBLIC_COMPANY_NAME, NEXT_PUBLIC_COMPANY_REGISTRATION,
 *   NEXT_PUBLIC_COMPANY_COUNTRY, NEXT_PUBLIC_CONTACT_EMAIL.
 *
 * For full legal completeness you will likely want to extend this page
 * with: legal form, share capital, registered office, publication
 * director, hosting provider details, etc.
 */
export default function MentionsLegalesPage() {
  return (
    <article className="prose-legal">
      <h1 className="text-[28px] font-semibold tracking-tight text-foreground mb-2">
        Mentions légales
      </h1>
      <p className="text-foreground-subtle text-[13px] mb-8">
        Informations légales relatives à l&apos;éditeur du portail {appConfig.name}.
      </p>

      <Section title="Éditeur du site">
        <Field label="Dénomination">{appConfig.companyName}</Field>
        <Field label="Identifiant légal">{appConfig.companyRegistration}</Field>
        <Field label="Pays">{appConfig.companyCountry}</Field>
        <Field label="Contact">
          <a
            href={`mailto:${appConfig.contactEmail}`}
            className="text-primary hover:underline"
          >
            {appConfig.contactEmail}
          </a>
        </Field>
      </Section>

      <Section title="Hébergeur">
        <p>
          Renseignez ici les coordonnées de votre hébergeur (nom, siège, datacenter de référence).
        </p>
      </Section>

      <Section title="Propriété intellectuelle">
        <p>
          L&apos;ensemble des éléments composant le portail {appConfig.name} (textes, logos, code,
          design, interfaces) est la propriété de leurs auteurs respectifs. Le code source de la
          plateforme est distribué sous licence MIT (voir{' '}
          <a
            href="https://github.com/"
            className="text-primary hover:underline"
            rel="noopener noreferrer"
            target="_blank"
          >
            le dépôt source
          </a>
          ) ; les contenus saisis par les organisations utilisatrices restent leur propriété.
        </p>
      </Section>

      <Section title="Données personnelles">
        <p>
          Le traitement des données personnelles fait l&apos;objet d&apos;une page dédiée. Voir la{' '}
          <a href="/politique-de-confidentialite" className="text-primary hover:underline">
            politique de confidentialité
          </a>{' '}
          pour le détail des finalités, bases légales, durées de conservation et droits des
          personnes.
        </p>
      </Section>

      <Section title="Cookies">
        <p>
          {appConfig.name} utilise uniquement des cookies techniques nécessaires au fonctionnement
          du service. La{' '}
          <a href="/cookies" className="text-primary hover:underline">
            page cookies
          </a>{' '}
          en détaille la liste.
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
      <div className="space-y-2 text-[14px] text-foreground-muted leading-relaxed">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-x-4 gap-y-1">
      <span className="text-foreground-subtle text-[13px]">{label}</span>
      <span className="text-foreground">{children}</span>
    </div>
  );
}
