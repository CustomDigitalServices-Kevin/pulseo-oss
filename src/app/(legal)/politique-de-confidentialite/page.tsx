import type { Metadata } from 'next';
import { appConfig } from '@/config/app-config';

export const metadata: Metadata = {
  title: 'Politique de confidentialité',
  description: `Politique de protection des données personnelles du portail ${appConfig.name} (RGPD, art. 13).`,
};

/**
 * Generic privacy-policy template (RGPD-style).
 *
 * Pulseo is multi-tenant, so the deploying organization typically acts both
 * as a **processor** (art. 28) for tenant business data and as a
 * **controller** (art. 4.7) for platform-account data. Edit this template
 * to match your actual sub-processor stack and conservation policies.
 */
export default function PolitiqueConfidentialitePage() {
  return (
    <article className="prose-legal">
      <h1 className="text-[28px] font-semibold tracking-tight text-foreground mb-2">
        Politique de confidentialité
      </h1>
      <p className="text-foreground-subtle text-[13px] mb-8">
        Politique de protection des données personnelles applicable au portail {appConfig.name}.
      </p>

      <Section title="1. Rôles et responsabilités RGPD">
        <p>
          <strong>{appConfig.companyName}</strong>, opérateur du portail {appConfig.name},
          intervient avec une <strong>double qualification RGPD</strong> selon la nature des
          données traitées.
        </p>
        <div className="rounded-md border border-border p-3 space-y-2">
          <p>
            <strong className="text-foreground">
              a) Sous-traitant (art. 28 RGPD) — données métier des clients
            </strong>
          </p>
          <p>
            Pour les contenus saisis par les utilisateurs dans le cadre de leur organisation
            cliente (tickets, commentaires, contrats, documents, livrables, projets),{' '}
            {appConfig.companyName} agit en qualité de <em>sous-traitant</em> au sens de
            l&apos;article 28 du RGPD. Le responsable de traitement est l&apos;organisation cliente
            qui détermine les finalités et les moyens du traitement.
          </p>
        </div>
        <div className="rounded-md border border-border p-3 space-y-2">
          <p>
            <strong className="text-foreground">
              b) Responsable de traitement — gestion des comptes et exploitation
            </strong>
          </p>
          <p>
            Pour les données strictement nécessaires à la fourniture du service (création et
            authentification du compte utilisateur, journaux d&apos;audit, métriques techniques,
            facturation, support), {appConfig.companyName} agit en qualité de{' '}
            <em>responsable de traitement</em> au sens de l&apos;article 4.7 du RGPD.
          </p>
        </div>
      </Section>

      <Section title="2. Contact vie privée">
        <p>
          Toute demande relative à vos données personnelles peut être adressée au contact vie
          privée :
        </p>
        <p>
          <a
            href={`mailto:${appConfig.dpoEmail}`}
            className="text-primary hover:underline"
          >
            {appConfig.dpoEmail}
          </a>
        </p>
      </Section>

      <Section title="3. Finalités, bases légales et données traitées">
        <Table
          rows={[
            {
              purpose: 'Création et gestion de votre compte (login par lien magique)',
              data: 'Email, prénom, nom, locale préférée, avatar (optionnel)',
              legal: 'Exécution du contrat (art. 6.1.b RGPD)',
            },
            {
              purpose: 'Création, suivi et résolution de tickets, commentaires, contrats',
              data: 'Contenu rédigé, pièces jointes, métadonnées (dates, statut, priorité)',
              legal: 'Exécution du contrat (art. 6.1.b)',
            },
            {
              purpose: 'Notifications transactionnelles par email',
              data: 'Email destinataire, sujet et contenu de la notification',
              legal: 'Exécution du contrat (art. 6.1.b)',
            },
            {
              purpose: 'Sécurité, traçabilité, prévention de la fraude (audit logs)',
              data: 'IP, user-agent, action effectuée, identifiant utilisateur',
              legal: 'Intérêt légitime (art. 6.1.f) + obligation art. 32 RGPD',
            },
            {
              purpose: 'Reporting opérationnel (digest quotidien)',
              data: "Statistiques agrégées sur l'activité tickets",
              legal: 'Exécution du contrat (art. 6.1.b)',
            },
          ]}
        />
      </Section>

      <Section title="4. Destinataires des données">
        <ul className="list-disc pl-5 space-y-1">
          <li>Les membres de votre organisation (gestionnaires, admins) selon leur rôle</li>
          <li>Les responsables externes désignés par votre organisation pour recevoir les notifs</li>
          <li>L&apos;équipe support de {appConfig.companyName} (administration plateforme)</li>
          <li>Nos sous-traitants ultérieurs (voir section 5)</li>
        </ul>
        <p>Aucune donnée n&apos;est cédée ou vendue à des tiers à des fins commerciales.</p>
      </Section>

      <Section title="5. Sous-traitants ultérieurs et transferts">
        <p>
          La liste exhaustive des sous-traitants (hébergement, envoi d&apos;emails, antivirus,
          etc.) ainsi que les éventuels transferts hors UE et leurs mécanismes d&apos;encadrement
          (SCC, EU-US DPF) sont publiés sur demande au contact vie privée ci-dessus.
        </p>
      </Section>

      <Section title="6. Durées de conservation">
        <Table
          rows={[
            { purpose: 'Compte actif', data: '—', legal: 'Durée du contrat + 3 ans' },
            { purpose: 'Tickets et commentaires', data: '—', legal: '5 ans (archive opérationnelle)' },
            { purpose: 'Contrats', data: '—', legal: '10 ans (obligation comptable selon juridiction)' },
            { purpose: "Logs d'audit (sécurité)", data: '—', legal: '1 an (recommandation CNIL + art. 32 RGPD)' },
            { purpose: "Logs d'envoi email", data: '—', legal: '90 jours' },
            { purpose: 'Sessions expirées', data: '—', legal: 'Purge immédiate' },
          ]}
        />
      </Section>

      <Section title="7. Vos droits">
        <p>
          Conformément aux articles 15 à 22 du RGPD, vous disposez des droits suivants :
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Accès</strong> (art. 15) : obtenir copie de vos données personnelles
          </li>
          <li>
            <strong>Rectification</strong> (art. 16) : corriger une donnée inexacte ou incomplète
          </li>
          <li>
            <strong>Effacement</strong> (art. 17) : demander la suppression de vos données
          </li>
          <li>
            <strong>Limitation</strong> (art. 18) : restreindre certains traitements
          </li>
          <li>
            <strong>Portabilité</strong> (art. 20) : récupérer vos données dans un format
            structuré et lisible par machine (JSON)
          </li>
          <li>
            <strong>Opposition</strong> (art. 21) : vous opposer à un traitement fondé sur
            l&apos;intérêt légitime
          </li>
        </ul>
        <p>
          Pour exercer vos droits, utilisez l&apos;espace dédié{' '}
          <a href="/me/rgpd" className="text-primary hover:underline">
            « Mes données »
          </a>{' '}
          ou écrivez au contact vie privée. Réponse sous 1 mois (extensible 3 mois en cas de
          complexité, art. 12.3).
        </p>
      </Section>

      <Section title="8. Décision automatisée">
        <p>
          {appConfig.name} ne procède à aucune prise de décision exclusivement automatisée
          produisant des effets juridiques sur vous au sens de l&apos;article 22 du RGPD.
        </p>
      </Section>

      <Section title="9. Réclamation auprès de l'autorité de contrôle">
        <p>
          Si vous estimez que le traitement de vos données ne respecte pas la réglementation, vous
          pouvez introduire une réclamation auprès de l&apos;autorité de contrôle compétente dans
          votre pays de résidence ou de travail (CNIL en France,{' '}
          <a
            href="https://edpb.europa.eu/about-edpb/about-edpb/members_en"
            className="text-primary hover:underline"
            rel="noopener noreferrer"
            target="_blank"
          >
            liste complète EDPB
          </a>{' '}
          pour l&apos;UE).
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

function Table({ rows }: { rows: Array<{ purpose: string; data: string; legal: string }> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px] border-collapse">
        <thead>
          <tr className="text-left text-foreground-subtle">
            <th className="py-2 pr-3 font-medium">Finalité</th>
            <th className="py-2 px-3 font-medium">Données</th>
            <th className="py-2 pl-3 font-medium">Base légale / Durée</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.purpose} className="border-t border-border">
              <td className="py-2 pr-3 align-top text-foreground">{row.purpose}</td>
              <td className="py-2 px-3 align-top">{row.data}</td>
              <td className="py-2 pl-3 align-top">{row.legal}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
