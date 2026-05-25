# Pulseo — Guide Better Auth

Ce guide couvre l'intégration complète de **Better Auth** dans le projet Pulseo, incluant la configuration côté serveur, la configuration côté client, les middlewares, et le mappage avec le modèle métier Pulseo.

## Table des matières

1. [Installation](#installation)
2. [Configuration serveur](#configuration-serveur)
3. [Configuration client](#configuration-client)
4. [Route handler](#route-handler)
5. [Middleware](#middleware)
6. [Plugin organization](#plugin-organization)
7. [Plugin magicLink](#plugin-magiclink)
8. [Mappage avec Pulseo](#mappage-avec-pulseo)
9. [Gotchas courants](#gotchas-courants)

---

## Installation

Installez les dépendances nécessaires :

```bash
npm install better-auth better-auth/adapters/drizzle better-auth/plugins
npm install resend dotenv
```

### Dépendances requises

- **better-auth** : cœur d'authentification
- **better-auth/adapters/drizzle** : adaptateur pour Drizzle ORM
- **better-auth/plugins** : plugins organization et magicLink
- **resend** : service d'envoi d'emails pour magic links
- **dotenv** : gestion des variables d'environnement

---

## Configuration serveur

### Fichier : `lib/auth.ts`

```typescript
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization, magicLink } from "better-auth/plugins";
import { db } from "./db";
import { sendEmail } from "./email";

export const auth = betterAuth({
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
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
  },
  plugins: [
    organization({
      roles: {
        owner: {
          permissions: [
            "create:organization",
            "read:organization",
            "update:organization",
            "delete:organization",
            "manage:members",
            "manage:roles",
          ],
        },
        admin: {
          permissions: [
            "read:organization",
            "update:organization",
            "manage:members",
          ],
        },
        member: {
          permissions: ["read:organization"],
        },
      },
    }),
    magicLink({
      sendMagicLink: async (email, code, _request) => {
        const url = `${process.env.NEXT_PUBLIC_URL}/auth/magic-link?code=${code}`;
        await sendEmail({
          to: email,
          subject: "Votre lien magique Pulseo",
          html: `<p>Cliquez <a href="${url}">ici</a> pour vous connecter.</p>`,
        });
      },
    }),
  ],
  experimental: {
    enableWebAuthnAutofill: true,
    joinOrganizationOnSignUp: true,
  },
  session: {
    cookieCache: {
      enabled: true,
    },
  },
  trustedOrigins: [process.env.NEXT_PUBLIC_URL || "http://localhost:3000"],
});
```

### Configuration détaillée

**drizzleAdapter** :
- `provider: "pg"` : utilise le driver PostgreSQL
- `schema` : mappe les tables Better Auth aux noms dans Pulseo
- Ensure compatibility avec Drizzle ORM

**emailAndPassword** :
- `enabled: true` : active l'authentification par email/mot de passe
- `requireEmailVerification: true` : oblige la vérification d'email

**plugins** :
- `organization()` : gère les organisations et les rôles
- `magicLink()` : envoie des liens magiques via Resend

**experimental** :
- `enableWebAuthnAutofill` : support WebAuthn
- `joinOrganizationOnSignUp` : ajoute automatiquement l'utilisateur à une org

---

## Configuration client

### Fichier : `lib/auth-client.ts`

```typescript
import { createAuthClient } from "better-auth/client";
import { organizationClient } from "better-auth/client/plugins";
import { magicLinkClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_URL,
  plugins: [
    organizationClient(),
    magicLinkClient(),
  ],
});

// Exports pratiques pour les composants
export const { signUp, signIn, signOut, useSession } = authClient;
export const { listOrganizations, getOrganization, createOrganization, setActiveOrganization } = authClient.organization;
export const { sendMagicLink, verifyMagicLink } = authClient.magicLink;
```

### Utilisation dans les composants

```typescript
"use client";

import { authClient } from "@/lib/auth-client";
import { useState } from "react";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const handleMagicLink = async () => {
    setLoading(true);
    try {
      await authClient.magicLink.sendMagicLink({ email });
      // Afficher un message de succès
    } catch (error) {
      console.error("Erreur magic link:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      handleMagicLink();
    }}>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
      />
      <button type="submit" disabled={loading}>
        {loading ? "Envoi..." : "Envoyer le lien magique"}
      </button>
    </form>
  );
}
```

---

## Route handler

### Fichier : `app/api/auth/[...all]/route.ts`

```typescript
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(auth);
```

### Explication

- `toNextJsHandler()` : convertit Better Auth en route handler Next.js natif
- Route dynamique `[...all]` : capture tous les endpoints d'authentification
- Better Auth gère automatiquement `/api/auth/sign-in`, `/api/auth/sign-up`, etc.

---

## Middleware

### Fichier : `middleware.ts`

```typescript
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";

const protectedRoutes = ["/dashboard", "/settings", "/organizations"];

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Vérifier si la route est protégée
  const isProtected = protectedRoutes.some((route) =>
    path.startsWith(route)
  );

  if (!isProtected) {
    return NextResponse.next();
  }

  // Récupérer la session
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session) {
      // Rediriger vers la page de login
      const loginUrl = new URL("/auth/login", request.url);
      loginUrl.searchParams.set("redirect", path);
      return NextResponse.redirect(loginUrl);
    }

    // Ajouter l'utilisateur au contexte de la requête
    const response = NextResponse.next();
    response.headers.set("x-user-id", session.user.id);
    response.headers.set("x-user-email", session.user.email);
    return response;
  } catch (error) {
    console.error("Erreur middleware auth:", error);
    const loginUrl = new URL("/auth/login", request.url);
    return NextResponse.redirect(loginUrl);
  }
}

export const config = {
  matcher: [
    "/((?!_next|static|favicon.ico).*)",
  ],
};
```

### Configuration du middleware

- **protectedRoutes** : liste des routes nécessitant une authentification
- **auth.api.getSession()** : récupère la session depuis les headers
- **Redirection** : les utilisateurs non authentifiés sont redirigés vers `/auth/login`

---

## Plugin organization

### API et utilisation

```typescript
// Créer une organisation
const { data: org, error } = await authClient.organization.createOrganization({
  name: "Acme Corp",
  slug: "acme-corp",
  image: "https://example.com/logo.png",
});

// Lister les organisations de l'utilisateur
const { data: orgs } = await authClient.organization.listOrganizations();

// Récupérer l'organisation active
const { data: activeOrg } = await authClient.organization.getOrganization();

// Définir l'organisation active
await authClient.organization.setActiveOrganization({
  organizationId: org.id,
});

// Ajouter un membre
await authClient.organization.addMember({
  organizationId: org.id,
  email: "user@example.com",
  role: "member",
});

// Obtenir l'organisation complète (members + relations)
const { data: fullOrg } = await authClient.organization.getFullOrganization({
  organizationId: org.id,
});

// Lister les membres
const { data: members } = await authClient.organization.listOrganizationMembers({
  organizationId: org.id,
});

// Modifier le rôle d'un membre
await authClient.organization.updateMemberRole({
  organizationId: org.id,
  memberId: user.id,
  role: "admin",
});

// Inviter par email
await authClient.organization.inviteMember({
  organizationId: org.id,
  email: "newuser@example.com",
  role: "member",
});
```

### Rôles disponibles

| Rôle | Permissions | Description |
|------|-------------|-------------|
| `owner` | CRUD complet, gestion membres | Créateur de l'organisation |
| `admin` | Lecture, mise à jour, gestion membres | Administrateur |
| `member` | Lecture seulement | Membre standard |

---

## Plugin magicLink

### Configuration d'envoi

```typescript
// Dans lib/email.ts
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  return resend.emails.send({
    from: "noreply@pulseo.app",
    to,
    subject,
    html,
  });
}
```

### Flux magicLink

1. **Envoi du lien** :
```typescript
await authClient.magicLink.sendMagicLink({
  email: "user@example.com",
  callbackURL: "/dashboard",
});
```

2. **Vérification du code** :
```typescript
// URL de callback : /auth/magic-link?code=ABC123
const { data, error } = await authClient.magicLink.verifyMagicLink({
  code: code,
});

if (data) {
  // L'utilisateur est authentifié
  redirect("/dashboard");
}
```

### Composant callback

```typescript
"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";

export function MagicLinkCallback() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get("code");
    if (!code) {
      setError("Code manquant");
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const { data } = await authClient.magicLink.verifyMagicLink({ code });
        if (data) {
          router.push("/dashboard");
        } else {
          setError("Lien invalide ou expiré");
        }
      } catch (err) {
        setError("Erreur lors de la vérification");
      } finally {
        setLoading(false);
      }
    })();
  }, [searchParams, router]);

  if (loading) return <p>Vérification en cours...</p>;
  if (error) return <p className="text-red-600">{error}</p>;
  return null;
}
```

---

## Mappage avec Pulseo

### Correspondance des modèles

| Better Auth | Pulseo | Mapping |
|-------------|--------|---------|
| `organization` | `organization` | ID, nom, slug |
| `organizationMember` | `member` | Utilisateur + rôle dans org |
| `organizationMember.role = "admin"` | `gestionnaire` | Rôle équivalent |
| `organizationMember.role = "member"` | `contributeur` | Accès lecture/écriture limité |
| `organizationMember.role = "owner"` | `propriétaire` | Contrôle total |

### Schéma Drizzle avec Better Auth

```typescript
// schema/organizations.ts
import { pgTable, text, timestamp, uuid, pgEnum } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const organizationRoleEnum = pgEnum("organization_role", [
  "owner",
  "admin",
  "member",
]);

export const organization = pgTable("organization", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const organizationMember = pgTable("organizationMember", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id),
  userId: uuid("user_id").notNull(),
  role: organizationRoleEnum("role").notNull().default("member"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Relations
export const organizationRelations = relations(
  organization,
  ({ many }) => ({
    members: many(organizationMember),
  })
);

export const organizationMemberRelations = relations(
  organizationMember,
  ({ one }) => ({
    organization: one(organization, {
      fields: [organizationMember.organizationId],
      references: [organization.id],
    }),
  })
);
```

---

## Gotchas courants

### 1. Ordre des plugins

**Problème** : Les plugins doivent être chargés dans le bon ordre.

**Solution** :
```typescript
plugins: [
  organization(),      // D'abord
  magicLink(),         // Ensuite
]
```

### 2. Auto-generated vs Custom schema

**Problème** : Better Auth génère automatiquement les tables, mais on peut personnaliser.

**Solution** : Définir explicitement le `schema` dans `drizzleAdapter` plutôt que de laisser Better Auth générer.

### 3. Nom du cookie de session

**Problème** : Par défaut, Better Auth utilise `better-auth.session`, mais peut entrer en conflit.

**Solution** :
```typescript
session: {
  cookieName: "pulseo.session",
}
```

### 4. CORS et origines approuvées

**Problème** : Les requêtes cross-origin sont bloquées.

**Solution** :
```typescript
trustedOrigins: [
  "https://pulseo.app",
  "https://admin.pulseo.app",
  "http://localhost:3000"
]
```

### 5. Features expérimentales

**Attention** : `experimental.joinOrganizationOnSignUp` peut causer des erreurs si l'organisation par défaut n'existe pas.

**Solution** : Gérer la création d'organisation dans le callback post-signup.

### 6. Resend API Key

**Problème** : Oublier de définir `RESEND_API_KEY` dans `.env.local`.

**Solution** :
```bash
# .env.local
RESEND_API_KEY=re_xxxxxxxxxxxxx
NEXT_PUBLIC_URL=http://localhost:3000
```

### 7. Session cache

**Problème** : Les modifications de session ne sont pas propagées immédiatement.

**Solution** : Forcer le rafraîchissement après un changement d'organisation :
```typescript
await authClient.organization.setActiveOrganization({ organizationId: org.id });
await authClient.useSession.setState({ session: null }); // Force refresh
```

---

## Ressources

- [Better Auth docs](https://better-auth.com)
- [Drizzle ORM](https://orm.drizzle.team)
- [Resend Email](https://resend.com)
- [Next.js Middleware](https://nextjs.org/docs/advanced-features/middleware)
