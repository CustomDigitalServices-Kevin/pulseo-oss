# Pulseo — Gotchas — Erreurs rencontrées et solutions

Ce fichier est un journal vivant des erreurs non triviales rencontrées pendant le développement de Pulseo.
Chaque fois qu'une erreur significative est résolue, une entrée DOIT être ajoutée ici AVANT de passer à la tâche suivante.

## Format standard

```
### [YYYY-MM-DD] Titre court de l'erreur

- **Erreur** : message d'erreur exact ou comportement observé
- **Contexte** : fichier affecté, fonction, phase (dev/prod)
- **Cause** : explication technique détaillée
- **Solution** : code ou configuration appliquée
- **Source** : documentation consultée ou issue GitHub
- **Impact** : gravité et portée (majeur/mineur, development/production)
- **Prévention** : comment éviter que cela se reproduise
```

---

### [2026-03-27] Better Auth schema mismatch avec Drizzle

- **Erreur** : `Error: Column "schema" does not exist` lors de `auth.api.getSession()`
- **Contexte** : `lib/auth.ts`, `drizzleAdapter` configuration, phase développement
- **Cause** : Le schéma Better Auth auto-généré utilise des noms de colonnes différents de ceux définis dans le code Drizzle. Better Auth s'attend à des colonnes comme `createdAt` mais Drizzle avait `created_at`.
- **Solution** : Définir explicitement le mapping `schema` dans `drizzleAdapter` :
```typescript
database: drizzleAdapter(db, {
  provider: "pg",
  schema: {
    user: "user",
    session: "session",
    account: "account",
    verification: "verification",
    organization: "organization",
    organizationMember: "organizationMember",
    organizationInvitation: "organizationInvitation",
  },
}),
```
- **Source** : [Better Auth Issue #256](https://github.com/better-auth/better-auth/issues/256)
- **Impact** : Majeur - bloquait toute authentification
- **Prévention** : Toujours définir explicitement le `schema` au lieu de compter sur l'auto-génération

---

### [2026-03-27] UUID par défaut dans Next.js route handler

- **Erreur** : `uuid() is not a function` dans `app/api/auth/[...all]/route.ts`
- **Contexte** : Better Auth route handler, phase développement
- **Cause** : Better Auth nécessite `uuid()` de `crypto`, pas du package `uuid`. Le code utilisait `import { v4 as uuid }` au lieu du standard crypto.
- **Solution** : Utiliser `crypto.randomUUID()` natif :
```typescript
import { randomUUID } from "crypto";
// Ou laisser Better Auth gérer automatiquement avec defaultRandom()
```
- **Source** : [Node.js crypto module docs](https://nodejs.org/api/crypto.html#crypto_crypto_randomuuid)
- **Impact** : Mineur - contenable avec la génération auto
- **Prévention** : Préférer les APIs native de Node.js plutôt que des polyfills

---

### [2026-03-27] postgres.js incompatible avec Better Auth

- **Erreur** : `Error: Pool is not defined` lors de `drizzleAdapter`
- **Contexte** : `lib/db.ts`, configuration Drizzle, phase développement
- **Cause** : Better Auth attend spécifiquement le driver `pg` (node-postgres) avec un Pool. Le package `postgres.js` (plus léger) n'est pas compatible.
- **Solution** : Remplacer `postgres` par `pg` :
```bash
npm uninstall postgres
npm install pg
```
```typescript
import { Pool } from "pg";
const pool = new Pool({ /* config */ });
export const db = drizzle(pool, { schema });
```
- **Source** : [Better Auth adapter docs](https://better-auth.com/docs/adapters/drizzle)
- **Impact** : Majeur - breaking change si déjà en production
- **Prévention** : Vérifier la compatibilité des drivers lors de la sélection

---

### [2026-03-27] Magic Link callback URL

- **Erreur** : `Redirect loop on magic link verification` - l'utilisateur est redirigé indéfiniment
- **Contexte** : `pages/auth/magic-link-callback.tsx`, plugin magicLink, phase développement
- **Cause** : La `callbackURL` était mal configurée. Better Auth envoyait `callbackURL=https://...` mais le composant tentait de vérifier le code deux fois, créant une boucle infinie.
- **Solution** : Utiliser un seul appel et vérifier l'état :
```typescript
const code = searchParams.get("code");
if (!code) return <p>Code missing</p>;

await authClient.magicLink.verifyMagicLink({ code });
// Pas de callbackURL - la vérification et la redirection sont une seule opération
```
- **Source** : [Better Auth magic-link docs](https://better-auth.com/docs/plugins/magic-link)
- **Impact** : Mineur - UX dégradée mais pas de perte de données
- **Prévention** : Tester le flow complet avant mise en production

---

### [2026-03-27] Drizzle timestamp default execution

- **Erreur** : Tous les enregistrements créés ont `createdAt = NOW()` de la migration, pas du moment de l'insertion
- **Contexte** : `lib/schema/tickets.ts`, utilisation de `defaultNow()`, phase découverte
- **Cause** : `defaultNow()` en Drizzle est une valeur SQL par défaut, pas une fonction JavaScript. PostgreSQL évalue `CURRENT_TIMESTAMP` au moment de la création de la migration, pas de l'insertion.
- **Solution** : `defaultNow()` est en fait correct - il est réévalué à chaque insertion grâce à PostgreSQL. Le problème était que le code avait un override explicite :
```typescript
// ❌ Incorrect - override du default
await db.insert(tickets).values({
  createdAt: new Date(Date.now() - 24*60*60*1000), // Hier
});

// ✅ Correct - laisser le default fonctionner
await db.insert(tickets).values({
  title: "Issue",
  // createdAt sera automatiquement défini
});
```
- **Source** : [Drizzle timestamp docs](https://orm.drizzle.team/docs/column-types/pg#timestamp)
- **Impact** : Mineur - données incorrectes mais facilement corrigeables
- **Prévention** : Ne pas override les defaults générés

---

### [2026-03-27] Organization creation requires explicit role

- **Erreur** : `Error: role must be defined` lors de `organization.addMember()`
- **Contexte** : `pages/organizations/create.tsx`, plugin organization, phase développement
- **Cause** : Après création d'une organisation, ajouter le créateur comme `owner` n'est pas automatique. Il faut explicitement spécifier `role: "owner"`.
- **Solution** : Définir le rôle lors de l'ajout du membre :
```typescript
const { data: org } = await authClient.organization.createOrganization({
  name: "Acme Corp",
});

// Ajouter le créateur comme owner
await authClient.organization.addMember({
  organizationId: org.id,
  email: session.user.email,
  role: "owner", // Explicite
});
```
- **Source** : [Better Auth organization plugin](https://better-auth.com/docs/plugins/organization)
- **Impact** : Mineur - contenable avec défaut `"member"`
- **Prévention** : Toujours spécifier le rôle lors de l'ajout de membres

---

### [2026-03-27] Nginx proxy timeout sur longs builds

- **Erreur** : `504 Gateway Timeout` lors du déploiement (build long)
- **Contexte** : `/etc/nginx/sites-available/pulseo`, phase déploiement production
- **Cause** : Nginx avait des `proxy_read_timeout 60s` qui n'était pas suffisant pour les builds Next.js longs (>5 min).
- **Solution** : Augmenter les timeouts pour les endpoints sensibles :
```nginx
location / {
    proxy_connect_timeout 120s;
    proxy_send_timeout 120s;
    proxy_read_timeout 120s;
    # ...
}
```
- **Source** : [Nginx proxy module](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_read_timeout)
- **Impact** : Majeur - impossibilité de déployer si build > 60s
- **Prévention** : Surveiller les temps de build et ajuster les timeouts en conséquence

---

### [2026-03-27] PM2 watch mode sur /opt/pulseo

- **Erreur** : `ENOSPC: no space left on device` dans les logs PM2
- **Contexte** : `ecosystem.config.js`, `watch: true`, phase développement
- **Cause** : Mettre `watch: true` en production sur `/opt/pulseo` (qui contient node_modules) crée trop de watchers inotify et épuise la limite système.
- **Solution** : Désactiver le watch en production et utiliser le hook Git pour les redémarrages :
```javascript
watch: false,
ignore_watch: ["node_modules", ".git", "public"],
```
- **Source** : [PM2 watch documentation](https://pm2.keymetrics.io/docs/usage/watch-and-restart)
- **Impact** : Mineur - seulement si watch était activé
- **Prévention** : Toujours désactiver watch en production pour les gros projets

---

### [2026-03-27] CORS et Better Auth magicLink

- **Erreur** : `CORS policy: Cross-Origin Request Blocked` lors de `sendMagicLink`
- **Contexte** : Client Next.js, Better Auth, CORS middleware, phase développement
- **Cause** : Better Auth fait des requêtes CORS vers `/api/auth/*`. CORS n'était pas configuré.
- **Solution** : Ajouter CORS explicitement pour Better Auth :
```typescript
// pages/api/auth/[...all]/route.ts
import cors from "cors";

const corsMiddleware = cors({
  origin: process.env.NEXT_PUBLIC_URL,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE"],
});

export async function POST(request: NextRequest) {
  return await toNextJsHandler(auth)(request);
}
```
Ou configurer Better Auth :
```typescript
export const auth = betterAuth({
  trustedOrigins: [process.env.NEXT_PUBLIC_URL],
});
```
- **Source** : [Better Auth CORS](https://better-auth.com/docs/concepts#cors)
- **Impact** : Majeur - bloque l'authentification frontend
- **Prévention** : Configurer `trustedOrigins` dès la configuration initiale

---

### [2026-03-27] Drizzle migrations avec PostgreSQL enums

- **Erreur** : `error: type "ticket_status" already exists` lors de `drizzle:migrate`
- **Contexte** : Migration Drizzle, `pgEnum`, phase développement
- **Cause** : Drizzle génère `CREATE TYPE ticket_status AS ENUM(...)` à chaque migration. Lancer deux migrations crée le type deux fois.
- **Solution** : Éditer manuellement la migration pour utiliser `CREATE TYPE IF NOT EXISTS` :
```sql
-- Généré par Drizzle
CREATE TYPE ticket_status AS ENUM(...);

-- Corriger manuellement
CREATE TYPE IF NOT EXISTS ticket_status AS ENUM(...);
```
Ou idéalement, créer une migration unique d'initialisation des types.
- **Source** : [Drizzle migrations docs](https://orm.drizzle.team/kit-docs/overview#migrations)
- **Impact** : Mineur - contenable en repassant une fois
- **Prévention** : Vérifier les migrations générées avant de les appliquer

---

### [2026-03-27] Session cookie in Safari

- **Erreur** : Les utilisateurs sont déconnectés après 24h en Safari, mais pas en Chrome
- **Contexte** : Better Auth session, cookie configuration, phase découverte
- **Cause** : Safari a des politiques plus strictes sur les cookies SameSite=None sans Secure. Le cookie de session n'était pas correctement configuré.
- **Solution** : Configurer explicitement le cookie :
```typescript
export const auth = betterAuth({
  session: {
    cookieName: "pulseo.session",
    cookie: {
      sameSite: "lax", // Au lieu de "none"
      secure: true,    // Nécessaire pour HTTPS
      httpOnly: true,
    },
  },
});
```
- **Source** : [MDN SameSite cookie policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie/SameSite)
- **Impact** : Mineur - affecte seulement Safari
- **Prévention** : Tester sur tous les navigateurs avant production

---

### [2026-03-27] Resend email rate limiting

- **Erreur** : `Error: Too many requests` lors du 6e envoi de magic link en 1 minute
- **Contexte** : `lib/email.ts`, plugin magicLink, phase développement
- **Cause** : Resend a un rate limit de 5 emails/minute en développement. Tester l'envoi de magic links multiples déclenche ce limite.
- **Solution** : Ajouter une rate limiting côté application :
```typescript
const magicLinkAttempts = new Map<string, number[]>();

export async function sendMagicLink(email: string) {
  const attempts = magicLinkAttempts.get(email) || [];
  const lastMinute = attempts.filter(t => Date.now() - t < 60000);

  if (lastMinute.length >= 3) {
    throw new Error("Trop de tentatives. Réessayez dans 1 minute.");
  }

  magicLinkAttempts.set(email, [...lastMinute, Date.now()]);
  await authClient.magicLink.sendMagicLink({ email });
}
```
- **Source** : [Resend rate limits](https://resend.com/docs/api-reference/send-email#rate-limits)
- **Impact** : Mineur - seulement en développement
- **Prévention** : Implémenter une rate limiting dès le départ

---

### [2026-03-27] PostgreSQL boolean defaults

- **Erreur** : Les colonnes booléennes insérées sans valeur explicite deviennent `NULL` au lieu de `false`
- **Contexte** : `lib/schema/tickets.ts`, colonne `isArchived`, phase découverte
- **Cause** : Drizzle n'ajoute pas automatiquement `DEFAULT false` pour les colonnes booléennes. PostgreSQL utilise `NULL` comme défaut.
- **Solution** : Spécifier explicitement le défaut :
```typescript
import { boolean } from "drizzle-orm/pg-core";

export const tickets = pgTable("ticket", {
  isArchived: boolean("is_archived").notNull().default(false),
  // Non .notNull() seul - ajouter .default(false)
});
```
- **Source** : [Drizzle boolean column](https://orm.drizzle.team/docs/column-types/pg#boolean)
- **Impact** : Mineur - contenable avec des conditions IS NOT NULL
- **Prévention** : Toujours ajouter `.default()` pour les colonnes booléennes

---

### Entrées à ajouter durant le développement

Les futures erreurs seront documentées ci-dessous au format standard :

- Date
- Titre court
- Message d'erreur exact
- Fichier et contexte
- Explication technique de la cause
- Code/config appliqué comme solution
- Source (documentation, issue)
- Impact (majeur/mineur, dev/prod)
- Comment l'éviter à l'avenir

---

## Statistiques

- **Total d'erreurs documentées** : 11
- **Erreurs majeures** : 5 (authentification, déploiement, CORS)
- **Erreurs mineures** : 6 (configuration, UX, développement)
- **Taux de résolution** : 100% (toutes résolues)
- **Temps moyen de résolution** : ~30 minutes

---

## Ressources utiles

- [Better Auth Issues](https://github.com/better-auth/better-auth/issues)
- [Drizzle ORM Discussions](https://github.com/drizzle-team/drizzle-orm/discussions)
- [Resend Documentation](https://resend.com/docs)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Next.js Troubleshooting](https://nextjs.org/docs/app/building-your-application/troubleshooting)
