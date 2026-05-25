# Pulseo — Checklist de sécurité complète

**Version**: 1.0
**Dernière mise à jour**: 2026-03-27
**Responsable**: Équipe sécurité Pulseo

---

## 1. Authentification & Sessions

### 1.1 Cookies de session

- [x] **httpOnly**: Tous les cookies de session doivent avoir le flag `httpOnly` activé
  - Empêche l'accès via JavaScript (XSS mitigation)
  - Configuration dans `Better Auth` : `httpOnly: true`

- [x] **Secure flag**: Obligatoire en production
  - Les cookies ne sont transmis que via HTTPS
  - Configuration : `secure: true` (auto-détecté en prod)

- [x] **SameSite**: Utiliser `lax` pour équilibrer sécurité et UX
  - CSRF protection native
  - `sameSite: "lax"` dans `Better Auth.config`

### 1.2 Durée de session

- [x] **Session gestionnaire**: 24 heures
  - Durée raisonnable pour utilisation normale
  - Implémenter expiration automatique côté serveur

- [x] **Session admin**: 8 heures maximum
  - Privilèges élevés = fenêtre temporelle réduite
  - Re-authentification requise après expiration

- [x] **Token refresh**: Impossible après expiration
  - Pas de prolongation silencieuse
  - Force re-login pour sécurité accrued

### 1.3 Limiteur de débit (Rate limiting)

- [x] **Endpoint login**: 5 tentatives par IP par 15 minutes
  - Protège contre brute-force
  - Blocage temporaire après dépassement
  - IP blanche configurable pour développement

- [x] **Implémentation Nginx** (voir section 11)
  - Zones limitées par IP source
  - Log des tentatives excessives

### 1.4 Politique de mot de passe

- [x] **Longueur minimale**: 12 caractères
  - Au minimum 12 caractères (NIST recommendations)
  - Pas d'affichage du compteur de force (évite l'optimisation d'attaque)

- [x] **Complexité OWASP**:
  - Au moins 1 majuscule
  - Au moins 1 minuscule
  - Au moins 1 chiffre
  - Au moins 1 caractère spécial (@, #, $, %, &, !, ?)

- [x] **Validation Zod côté serveur** (voir section 4):
  ```typescript
  const passwordSchema = z.string()
    .min(12, "Minimum 12 caractères")
    .regex(/[A-Z]/, "Au moins 1 majuscule")
    .regex(/[a-z]/, "Au moins 1 minuscule")
    .regex(/\d/, "Au moins 1 chiffre")
    .regex(/[@#$%&!?]/, "Au moins 1 caractère spécial");
  ```

- [x] **Hashage**: Utiliser `bcrypt` via Better Auth (11 rounds minimum)
  - Jamais stocker en plaintext
  - Jamais utiliser MD5 ou SHA-1

### 1.5 Configuration Better Auth

- [x] **Trust proxy**: Activé en production
  - Détecte correctement l'IP client derrière proxy/CDN
  ```typescript
  trustProxy: true
  ```

- [x] **Hashing algorithme**: argon2id par défaut (sinon bcrypt)
  - Résistant aux attaques GPU/ASIC

---

## 2. Magic Links (Liens magiques)

### 2.1 Expiration et validité

- [x] **Durée de validité**: 7 jours maximum
  - Après 7 jours, le token devient invalide
  - Utilisateur doit demander nouveau lien

- [x] **Génération**: UUID v4 cryptographiquement sécurisé
  ```typescript
  import { randomUUID } from "crypto";
  const token = randomUUID(); // v4
  ```

- [x] **Stockage**: Hashé en base de données (jamais plaintext)
  - Utiliser SHA-256 ou similaire
  - Comparer via timing-safe comparison

### 2.2 Révocation

- [x] **Admin peut révoquer**: Endpoint dédié
  - Marquer `revoked_at` avec timestamp
  - Effets immédiats

- [x] **Auto-révocation**: Après utilisation
  - Enregistrer `used_at` ou `usage_count`
  - Vérifier avant traitement

### 2.3 Politique d'utilisation

- [x] **Usage unique ou multi-usage configurable**:
  - Champ `max_uses` dans table `magic_links`
  - Contrôlé par admin pour chaque campagne
  - Exemple: `max_uses = 1` pour sécurité haute, `max_uses = 3` pour cas spéciaux

- [x] **Validation avant utilisation**:
  ```typescript
  const link = await db
    .select()
    .from(magicLinks)
    .where(eq(magicLinks.token, hashedToken))
    .where(gt(magicLinks.expiresAt, new Date()))
    .where(isNull(magicLinks.revokedAt))
    .where(or(
      isNull(magicLinks.maxUses),
      lt(magicLinks.usageCount, magicLinks.maxUses)
    ))
    .limit(1);
  ```

### 2.4 Base de données schema

```sql
CREATE TABLE magic_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  used_at TIMESTAMP,
  revoked_at TIMESTAMP,
  usage_count INTEGER NOT NULL DEFAULT 0,
  max_uses INTEGER DEFAULT 1,
  metadata JSONB,
  ip_address INET,
  user_agent TEXT
);

CREATE INDEX idx_magic_links_token_hash ON magic_links(token_hash);
CREATE INDEX idx_magic_links_expires_at ON magic_links(expires_at);
CREATE INDEX idx_magic_links_organization_id ON magic_links(organization_id);
```

---

## 3. Row-Level Security (RLS) PostgreSQL

### 3.1 Activité et couverture

- [x] **RLS activé sur 100% des tables métier**:
  - `tickets`
  - `ticket_comments`
  - `organizations`
  - `organization_members`
  - `files`
  - `qonto_tokens`
  - `audit_logs`
  - Toute table contenant données multi-tenant

- [x] **Vérification RLS activé** (audit régulier):
  ```sql
  SELECT schemaname, tablename, rowsecurity
  FROM pg_tables
  WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
  ORDER BY schemaname, tablename;
  ```

### 3.2 Politiques RLS

- [x] **SELECT policies**: Filtrer par `user_organization_id`
  ```sql
  CREATE POLICY tickets_select_policy ON tickets
    FOR SELECT
    USING (organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    ));
  ```

- [x] **INSERT policies**: Valider organisation avec WITH CHECK
  ```sql
  CREATE POLICY tickets_insert_policy ON tickets
    FOR INSERT
    WITH CHECK (
      organization_id IN (
        SELECT organization_id
        FROM organization_members
        WHERE user_id = auth.uid() AND deleted_at IS NULL
      )
      AND status = 'open'
    );
  ```

- [x] **UPDATE policies**: Vérifier permission ET données valides
  ```sql
  CREATE POLICY tickets_update_policy ON tickets
    FOR UPDATE
    USING (
      organization_id IN (
        SELECT organization_id
        FROM organization_members
        WHERE user_id = auth.uid() AND deleted_at IS NULL
      )
    )
    WITH CHECK (
      organization_id IN (
        SELECT organization_id
        FROM organization_members
        WHERE user_id = auth.uid() AND deleted_at IS NULL
      )
    );
  ```

- [x] **DELETE policies**: Admin seulement (soft delete recommandé)
  ```sql
  CREATE POLICY tickets_delete_policy ON tickets
    FOR DELETE
    USING (
      organization_id IN (
        SELECT organization_id
        FROM organization_members
        WHERE user_id = auth.uid()
        AND role = 'admin'
        AND deleted_at IS NULL
      )
    );
  ```

### 3.3 Fonctions sécurisées

- [x] **SECURITY DEFINER**: Pour opérations privilégiées
  - Créer dans schéma `private` (non public)
  - Exécutées avec permissions du créateur

  ```typescript
  // Fonction Postgres (schema: private)
  CREATE FUNCTION private.create_ticket_with_validation(
    p_organization_id UUID,
    p_user_id UUID,
    p_title TEXT,
    p_description TEXT
  ) RETURNS tickets AS $$
  DECLARE
    v_ticket tickets;
  BEGIN
    -- Vérifier que l'utilisateur appartient à l'org
    IF NOT EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_id = p_organization_id
      AND user_id = p_user_id
      AND deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'User not member of organization';
    END IF;

    INSERT INTO tickets (organization_id, created_by, title, description)
    VALUES (p_organization_id, p_user_id, p_title, p_description)
    RETURNING * INTO v_ticket;

    RETURN v_ticket;
  END;
  $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
  ```

### 3.4 Revoke des rôles publics

- [x] **REVOKE ALL sur anon/public**:
  ```sql
  REVOKE ALL ON DATABASE pulseo FROM anon;
  REVOKE ALL ON DATABASE pulseo FROM public;
  REVOKE ALL ON SCHEMA public FROM anon;
  REVOKE ALL ON SCHEMA public FROM public;

  -- Granter seulement les rôles authentifiés
  GRANT USAGE ON SCHEMA public TO authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
  ```

### 3.5 Double vérification

- [x] **RLS + Server Action verification**: Ne pas faire confiance à RLS seul
  - Vérifier `organization_id` manuellement dans Server Action
  - Comparer avec session utilisateur
  - Voir section 4 pour exemples

---

## 4. Validation Zero Trust

### 4.1 Zod sur chaque input

- [x] **Server Actions**: Valider tous les paramètres
  ```typescript
  'use server';

  import { z } from 'zod';
  import { auth } from '@/auth';

  const createTicketSchema = z.object({
    title: z.string()
      .min(5, "Minimum 5 caractères")
      .max(255, "Maximum 255 caractères")
      .trim(),
    description: z.string()
      .max(10000, "Maximum 10000 caractères")
      .optional(),
    organizationId: z.string().uuid("UUID invalide"),
    status: z.enum(['open', 'closed', 'on_hold']),
    priority: z.enum(['low', 'medium', 'high', 'critical']),
  });

  export async function createTicket(input: unknown) {
    const session = await auth();
    if (!session?.user?.id) throw new Error('Unauthorized');

    // Validation Zod
    const parsed = createTicketSchema.safeParse(input);
    if (!parsed.success) {
      return { error: 'Validation failed', details: parsed.error.flatten() };
    }

    // Double vérification: utilisateur appartient à l'org
    const member = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, parsed.data.organizationId),
          eq(organizationMembers.userId, session.user.id),
          isNull(organizationMembers.deletedAt)
        )
      )
      .limit(1);

    if (member.length === 0) {
      throw new Error('Not member of this organization');
    }

    // Créer le ticket (RLS + vérif manuel double)
    const ticket = await db.insert(tickets).values({
      organizationId: parsed.data.organizationId,
      createdBy: session.user.id,
      title: parsed.data.title,
      description: parsed.data.description,
      status: parsed.data.status,
      priority: parsed.data.priority,
    }).returning();

    return { ticket: ticket[0] };
  }
  ```

- [x] **API routes**: Validation identique
  ```typescript
  // app/api/tickets/route.ts
  import { z } from 'zod';
  import { NextRequest } from 'next/server';

  const ticketQuerySchema = z.object({
    organizationId: z.string().uuid(),
    status: z.enum(['open', 'closed', 'on_hold']).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
  });

  export async function GET(request: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const params = Object.fromEntries(request.nextUrl.searchParams);
    const parsed = ticketQuerySchema.safeParse(params);

    if (!parsed.success) {
      return Response.json(
        { error: 'Invalid parameters', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Même double vérification
    const tickets = await db
      .select()
      .from(ticketsTable)
      .where(eq(ticketsTable.organizationId, parsed.data.organizationId))
      // RLS appliquée automatiquement
      .limit(parsed.data.limit)
      .offset(parsed.data.offset);

    return Response.json({ tickets });
  }
  ```

- [x] **Form data**: Validation stricte
  ```typescript
  const uploadFileSchema = z.object({
    organizationId: z.string().uuid(),
    ticketId: z.string().uuid(),
    file: z.instanceof(File)
      .refine(f => f.size <= 10 * 1024 * 1024, "File too large"),
  });
  ```

### 4.2 XSS Protection

- [x] **Pas de dangerouslySetInnerHTML**
  - Grep l'entière codebase pour `dangerouslySetInnerHTML`
  - Si trouvé, refactoriser avec `react-markdown` ou sanitizer

- [x] **react-markdown pour contenu utilisateur**:
  ```typescript
  import ReactMarkdown from 'react-markdown';

  export function TicketDescription({ markdown }: { markdown: string }) {
    return (
      <ReactMarkdown
        disallowedElements={['script', 'iframe', 'img']}
        unwrapDisallowed
      >
        {markdown}
      </ReactMarkdown>
    );
  }
  ```

- [x] **Sanitizer HTML (si nécessaire)**:
  ```typescript
  import DOMPurify from 'isomorphic-dompurify';

  const clean = DOMPurify.sanitize(userHtml, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'p', 'br', 'a'],
    ALLOWED_ATTR: ['href'],
  });
  ```

### 4.3 Requêtes paramétrées

- [x] **Drizzle ORM uniquement** (jamais interpolation manuelle)
  ```typescript
  // ✓ BON - Drizzle parameterized
  const results = await db
    .select()
    .from(tickets)
    .where(eq(tickets.organizationId, orgId))
    .where(like(tickets.title, `%${searchTerm}%`));

  // ✗ MAUVAIS - SQL injection possible
  const results = await db.execute(
    `SELECT * FROM tickets WHERE title LIKE '%${searchTerm}%'`
  );
  ```

### 4.4 Content-Security-Policy (CSP)

- [x] **CSP headers avec nonces** (voir section 5)
  - Chaque `<script>` doit avoir `nonce={nonce}`
  - Générer nonce unique par requête

  ```typescript
  // middleware.ts
  import { NextRequest, NextResponse } from 'next/server';
  import { randomBytes } from 'crypto';

  export function middleware(request: NextRequest) {
    const nonce = randomBytes(16).toString('hex');
    const cspHeader = `
      default-src 'self';
      script-src 'self' 'nonce-${nonce}' https://cdn.example.com;
      style-src 'self' 'nonce-${nonce}';
      img-src 'self' data: https:;
      font-src 'self';
      connect-src 'self' https://api.qonto.com;
      frame-ancestors 'none';
      form-action 'self';
      base-uri 'self';
      object-src 'none';
    `.replace(/\n/g, '');

    const response = NextResponse.next();
    response.headers.set('Content-Security-Policy', cspHeader);
    response.headers.set('X-Nonce', nonce);

    return response;
  }

  export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
  };
  ```

---

## 5. HTTP Headers de sécurité

### 5.1 Configuration dans next.config.ts

```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
```

### 5.2 Headers détaillés

- [x] **X-Content-Type-Options: nosniff**
  - Empêche MIME type sniffing
  - Force respect du Content-Type déclaré

- [x] **X-Frame-Options: DENY**
  - Interdit embedding dans iframe (Clickjacking)
  - Alternative: `SAMEORIGIN` si embedding interne

- [x] **Strict-Transport-Security** (HSTS)
  - `max-age=31536000` = 1 an
  - `includeSubDomains` = applique à tous subdomains
  - `preload` = enregistrer sur HSTS preload list

- [x] **Content-Security-Policy**: Voir section 4.4

- [x] **Referrer-Policy: strict-origin-when-cross-origin**
  - Envoie referrer seulement cross-origin si HTTPS→HTTPS

- [x] **Permissions-Policy**:
  - Désactive caméra, microphone, géolocalisation, etc.
  - Réduire surface d'attaque

---

## 6. CSRF Protection

### 6.1 Server Actions (Native)

- [x] **CSRF token automatique**
  - Next.js génère token bound à session
  - Validé automatiquement pour Server Actions
  - Aucune configuration nécessaire

  ```typescript
  'use server';

  export async function updateTicket(ticketId: string, data: unknown) {
    // Token CSRF vérifié automatiquement par Next.js
    const session = await auth();
    // ... traiter requête
  }
  ```

### 6.2 Routes API personnalisées

- [x] **@edge-csrf/nextjs**:
  ```typescript
  import { createCsrfMiddleware } from '@edge-csrf/nextjs';

  export const csrfMiddleware = createCsrfMiddleware({
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'lax',
    },
  });

  // Dans middleware.ts
  export const middleware = (request: NextRequest) => {
    return csrfMiddleware(request);
  };

  export const config = {
    matcher: ['/api/:path*'],
  };
  ```

### 6.3 Cookies SameSite

- [x] **SameSite=lax** (par défaut)
  - Envoyé même pour top-level navigation
  - Non envoyé pour requêtes cross-site (POST depuis autre domaine)
  - Équilibre sécurité/UX

---

## 7. File Upload Security

### 7.1 Validation côté serveur

- [x] **Whitelist MIME types**:
  ```typescript
  const ALLOWED_MIMETYPES = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf',
  ];

  if (!ALLOWED_MIMETYPES.includes(file.type)) {
    throw new Error('MIME type not allowed');
  }
  ```

- [x] **Magic bytes verification** (file signature):
  ```typescript
  const getMagicBytes = async (file: File): Promise<Buffer> => {
    const buffer = await file.arrayBuffer();
    return Buffer.from(buffer.slice(0, 12));
  };

  const validateMagicBytes = (bytes: Buffer, mimeType: string) => {
    const signatures: Record<string, Buffer> = {
      'image/jpeg': Buffer.from([0xFF, 0xD8, 0xFF]),
      'image/png': Buffer.from([0x89, 0x50, 0x4E, 0x47]),
      'image/gif': Buffer.from([0x47, 0x49, 0x46]),
      'application/pdf': Buffer.from([0x25, 0x50, 0x44, 0x46]),
      'image/webp': Buffer.from([0x52, 0x49, 0x46, 0x46]),
    };

    const expected = signatures[mimeType];
    if (!expected) return false;

    return bytes.subarray(0, expected.length).equals(expected);
  };
  ```

### 7.2 Taille et stockage

- [x] **Limite de taille**: 10MB par fichier
  ```typescript
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

  if (file.size > MAX_FILE_SIZE) {
    throw new Error('File exceeds 10MB limit');
  }
  ```

- [x] **Stockage hors webroot**: `/opt/pulseo-storage/`
  - Ne jamais servir directement depuis public/
  - Utiliser endpoint dédié avec authentification

- [x] **Renommer avec UUID**:
  ```typescript
  import { randomUUID } from 'crypto';

  const fileName = randomUUID();
  const extension = file.name.split('.').pop();
  const storagePath = `/opt/pulseo-storage/${fileName}.${extension}`;
  ```

### 7.3 Sanitisation des noms

- [x] **Nettoyer noms de fichier**:
  ```typescript
  const sanitizeFilename = (filename: string): string => {
    return filename
      .replace(/\.\./g, '') // Path traversal
      .replace(/[^\w\-. ]/g, '') // Caractères spéciaux
      .substring(0, 255); // Max length
  };
  ```

### 7.4 Serveur Nginx

- [x] **Nginx configuration** (voir section 11):
  ```nginx
  location /files/ {
    alias /opt/pulseo-storage/;
    add_header X-Content-Type-Options nosniff;
    add_header Content-Disposition 'attachment';
    auth_request /auth/verify-file-access;
  }

  location = /auth/verify-file-access {
    proxy_pass http://127.0.0.1:3000;
    proxy_pass_request_body off;
    proxy_set_header Content-Length "";
  }
  ```

---

## 8. IDOR Protection (Insecure Direct Object Reference)

### 8.1 Identifiants non séquentiels

- [x] **UUID au lieu d'entiers**:
  - Tous les IDs publics/via API doivent être UUID v4
  - Évite enumération d'IDs

  ```typescript
  // ✓ BON
  const ticket = await db
    .select()
    .from(tickets)
    .where(eq(tickets.id, '550e8400-e29b-41d4-a716-446655440000'));

  // ✗ MAUVAIS - ID séquentiel
  const ticket = await db
    .select()
    .from(tickets)
    .where(eq(tickets.id, 12345));
  ```

### 8.2 Double vérification

- [x] **RLS + ownership check dans Server Action**:
  ```typescript
  'use server';

  export async function updateTicket(
    ticketId: string,
    organizationId: string,
    data: unknown
  ) {
    const session = await auth();
    if (!session?.user?.id) throw new Error('Unauthorized');

    // Parse et valide
    const parsed = updateTicketSchema.safeParse(data);
    if (!parsed.success) throw new Error('Validation failed');

    // Vérif 1: Utilisateur appartient à l'org
    const member = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, organizationId),
          eq(organizationMembers.userId, session.user.id),
          isNull(organizationMembers.deletedAt)
        )
      )
      .limit(1);

    if (member.length === 0) {
      throw new Error('Not member of organization');
    }

    // Vérif 2: Ticket appartient à l'org
    const ticket = await db
      .select()
      .from(tickets)
      .where(
        and(
          eq(tickets.id, ticketId),
          eq(tickets.organizationId, organizationId)
        )
      )
      .limit(1);

    if (ticket.length === 0) {
      throw new Error('Ticket not found or access denied');
    }

    // RLS appliquée automatiquement lors de UPDATE
    await db
      .update(tickets)
      .set(parsed.data)
      .where(eq(tickets.id, ticketId));
  }
  ```

- [x] **Jamais faire confiance à organizationId du client seul**
  - Toujours vérifier via session + membership

---

## 9. Open Redirect Protection

### 9.1 Paramètre returnTo

- [x] **Limiter à chemins relatifs**:
  ```typescript
  const isValidReturnPath = (path: string): boolean => {
    // Doit commencer par /
    if (!path.startsWith('/')) return false;

    // Ne pas contenir :// (protocole)
    if (path.includes('://')) return false;

    // Utiliser URL constructor pour parsing
    try {
      new URL(path, 'http://localhost');
      return true;
    } catch {
      return false;
    }
  };

  // Usage après login
  const returnTo = searchParams.get('returnTo') || '/dashboard';
  const safeReturnTo = isValidReturnPath(returnTo) ? returnTo : '/dashboard';

  return redirect(safeReturnTo);
  ```

- [x] **Whitelist d'URLs (si permettre externe)**:
  ```typescript
  const ALLOWED_EXTERNAL_URLS = [
    'https://docs.pulseo.io',
    'https://help.pulseo.io',
  ];

  const isValidReturnUrl = (url: string): boolean => {
    if (url.startsWith('/')) return true; // Relative paths OK

    try {
      const parsed = new URL(url);
      return ALLOWED_EXTERNAL_URLS.some(allowed =>
        parsed.origin === new URL(allowed).origin
      );
    } catch {
      return false;
    }
  };
  ```

- [x] **Jamais rediriger vers URL externe depuis auth flow**
  - Risque d'exposer token dans referrer
  - Utiliser POST-redirect-GET pattern

---

## 10. VPS Hardening

### 10.1 SSH

- [x] **Authentification par clé uniquement**:
  ```bash
  # /etc/ssh/sshd_config
  PasswordAuthentication no
  PubkeyAuthentication yes
  AuthorizedKeysFile .ssh/authorized_keys
  PermitRootLogin no
  X11Forwarding no
  ```

- [x] **Port personnalisé** (non 22):
  ```bash
  # /etc/ssh/sshd_config
  Port 2222

  # Puis redémarrer
  sudo systemctl restart ssh

  # Ufw rule
  sudo ufw allow 2222/tcp
  ```

- [x] **Désactiver root login**:
  ```bash
  PermitRootLogin no
  ```

### 10.2 Firewall UFW

- [x] **Ouvrir seulement les ports nécessaires**:
  ```bash
  sudo ufw default deny incoming
  sudo ufw default allow outgoing
  sudo ufw allow 80/tcp
  sudo ufw allow 443/tcp
  sudo ufw allow 2222/tcp
  sudo ufw enable
  ```

- [x] **Status et vérification**:
  ```bash
  sudo ufw status
  ```

### 10.3 Fail2ban

- [x] **SSH jail**:
  ```bash
  # /etc/fail2ban/jail.local
  [sshd]
  enabled = true
  port = 2222
  filter = sshd
  logpath = /var/log/auth.log
  maxretry = 5
  findtime = 600
  bantime = 3600
  ```

- [x] **Nginx jail** (voir section 11):
  ```bash
  [nginx-http-auth]
  enabled = true
  filter = nginx-http-auth
  logpath = /var/log/nginx/error.log
  maxretry = 5
  findtime = 600
  bantime = 1800
  ```

- [x] **Restart et status**:
  ```bash
  sudo systemctl restart fail2ban
  sudo fail2ban-client status
  ```

### 10.4 Mises à jour automatiques

- [x] **unattended-upgrades**:
  ```bash
  sudo apt-get install unattended-upgrades

  # /etc/apt/apt.conf.d/50unattended-upgrades
  Unattended-Upgrade::Packages {
    "security";
  };
  Unattended-Upgrade::Automatic-Reboot "true";
  Unattended-Upgrade::Automatic-Reboot-Time "02:00";
  ```

### 10.5 Utilisateur non-root

- [x] **Créer utilisateur dédié**:
  ```bash
  sudo useradd -m -s /bin/bash pulseo
  sudo usermod -aG docker pulseo  # Si Docker

  # App run-as
  sudo chown -R pulseo:pulseo /opt/pulseo
  sudo chmod 750 /opt/pulseo
  ```

- [x] **Systemd service**:
  ```ini
  [Unit]
  Description=Pulseo Next.js App
  After=network.target

  [Service]
  User=pulseo
  WorkingDirectory=/opt/pulseo
  ExecStart=/usr/bin/node /opt/pulseo/server.js
  Restart=on-failure
  RestartSec=10
  StandardOutput=journal
  StandardError=journal

  [Install]
  WantedBy=multi-user.target
  ```

---

## 11. Nginx Security Configuration

### 11.1 Rate Limiting Zones

```nginx
# /etc/nginx/nginx.conf (http block)

# Zones de rate limiting
limit_req_zone $binary_remote_addr zone=api:10m rate=30r/m;
limit_req_zone $binary_remote_addr zone=login:10m rate=5r/m;
limit_req_zone $binary_remote_addr zone=general:10m rate=100r/m;

upstream pulseo_backend {
  server 127.0.0.1:3000;
  keepalive 32;
}

server {
  listen 80;
  server_name pulseo.io www.pulseo.io;

  # Rediriger HTTP vers HTTPS
  return 301 https://$server_name$request_uri;
}

server {
  listen 443 ssl http2;
  server_name pulseo.io www.pulseo.io;

  # SSL
  ssl_certificate /etc/letsencrypt/live/pulseo.io/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/pulseo.io/privkey.pem;

  # Ciphers sécurisés
  ssl_protocols TLSv1.2 TLSv1.3;
  ssl_ciphers HIGH:!aNULL:!MD5;
  ssl_prefer_server_ciphers on;
  ssl_session_cache shared:SSL:10m;
  ssl_session_timeout 10m;

  # HSTS
  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;

  # Security headers
  add_header X-Content-Type-Options "nosniff" always;
  add_header X-Frame-Options "DENY" always;
  add_header X-XSS-Protection "1; mode=block" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
  add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;

  # Hide Nginx version
  server_tokens off;

  # Limiting
  client_max_body_size 10M;

  # Logging
  access_log /var/log/nginx/access.log;
  error_log /var/log/nginx/error.log;

  # API routes rate limiting
  location /api/ {
    limit_req zone=api burst=5 nodelay;
    proxy_pass http://pulseo_backend;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
  }

  # Login endpoint
  location = /auth/signin {
    limit_req zone=login burst=3 nodelay;
    proxy_pass http://pulseo_backend;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
  }

  # File downloads (avec vérification auth)
  location /files/ {
    alias /opt/pulseo-storage/;
    add_header X-Content-Type-Options nosniff always;
    add_header Content-Disposition 'attachment' always;
    auth_request /auth/verify-file-access;
  }

  location = /auth/verify-file-access {
    internal;
    proxy_pass http://pulseo_backend;
    proxy_pass_request_body off;
    proxy_set_header Content-Length "";
  }

  # Reste du traffic
  location / {
    limit_req zone=general burst=20 nodelay;
    proxy_pass http://pulseo_backend;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
    proxy_hide_header X-Powered-By;
  }
}
```

---

## 12. Qonto API Security

### 12.1 Tokens chiffrés

- [x] **Chiffrement AES-256 avec pgcrypto**:
  ```sql
  CREATE EXTENSION IF NOT EXISTS pgcrypto;

  CREATE TABLE qonto_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    access_token_encrypted BYTEA NOT NULL,
    refresh_token_encrypted BYTEA NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMP
  );

  CREATE INDEX idx_qonto_tokens_org ON qonto_tokens(organization_id);
  ```

- [x] **Stocker avec clé secrète**:
  ```typescript
  import { pgvector } from 'drizzle-orm/pg-core';

  const encryptToken = async (token: string, secretKey: string) => {
    // Utiliser NODE crypto ou library
    const encrypted = await db.execute(
      sql`SELECT pgp_sym_encrypt(${token}, ${secretKey})`
    );
    return encrypted[0].pgp_sym_encrypt;
  };

  const decryptToken = async (encrypted: Uint8Array, secretKey: string) => {
    const decrypted = await db.execute(
      sql`SELECT pgp_sym_decrypt(${encrypted}, ${secretKey})`
    );
    return decrypted[0].pgp_sym_decrypt;
  };
  ```

### 12.2 Rotation de token refresh

- [x] **Rotation à chaque utilisation**:
  ```typescript
  const refreshQontoToken = async (
    organizationId: string,
    oldRefreshToken: string
  ) => {
    // Appel Qonto API
    const response = await fetch('https://api.qonto.com/v2/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: oldRefreshToken,
        client_id: process.env.QONTO_CLIENT_ID,
        client_secret: process.env.QONTO_CLIENT_SECRET,
      }),
    });

    const data = await response.json();

    // Stocker nouveau token
    await db
      .update(qontoTokens)
      .set({
        accessToken: data.access_token,
        refreshToken: data.refresh_token, // Nouveau token
        expiresAt: new Date(Date.now() + data.expires_in * 1000),
        updatedAt: new Date(),
      })
      .where(eq(qontoTokens.organizationId, organizationId));

    return data.access_token;
  };
  ```

### 12.3 Server-side only

- [x] **Jamais exposer au client**:
  - Tokens stockés en DB seulement
  - Access via Server Actions ou API routes (with session check)
  - Jamais retourner token en JSON response

- [x] **Scope minimal**:
  - Permission Qonto: `client_invoices.read` uniquement
  - Pas d'accès write
  - Pas d'accès à autres entités

---

## 13. Audit Logging

### 13.1 Table d'audit

```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  action VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID,
  details JSONB,
  ip_address INET NOT NULL,
  user_agent TEXT,
  level VARCHAR(20) NOT NULL CHECK (level IN ('info', 'warning', 'error', 'critical')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_org ON audit_logs(organization_id);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);
```

### 13.2 Actions à logger

- [x] **Authentification**:
  - `login` - Connexion réussie
  - `login_failed` - Tentative échouée
  - `logout` - Déconnexion
  - `magic_link_created` - Lien magique généré
  - `magic_link_used` - Lien magique utilisé
  - `magic_link_revoked` - Lien révoqué

- [x] **Tickets**:
  - `ticket_created`
  - `ticket_updated`
  - `ticket_deleted` (soft-delete)
  - `ticket_comment_added`
  - `ticket_comment_updated`
  - `ticket_comment_deleted`

- [x] **Organisation**:
  - `org_created`
  - `org_updated`
  - `member_added`
  - `member_removed`
  - `member_role_changed`

- [x] **Files**:
  - `file_uploaded`
  - `file_downloaded`
  - `file_deleted`

- [x] **Sync externe**:
  - `qonto_sync_started`
  - `qonto_sync_completed`
  - `qonto_sync_failed`

### 13.3 Helper function

```typescript
'use server';

import { db } from '@/lib/db';
import { auditLogs } from '@/schema';
import { headers } from 'next/headers';

interface LogAuditParams {
  userId: string | null;
  organizationId: string;
  action: string;
  entityType: string;
  entityId?: string;
  details?: Record<string, unknown>;
  level?: 'info' | 'warning' | 'error' | 'critical';
}

export async function logAudit({
  userId,
  organizationId,
  action,
  entityType,
  entityId,
  details = {},
  level = 'info',
}: LogAuditParams) {
  const headersList = await headers();
  const ipAddress = headersList.get('x-forwarded-for') ||
    headersList.get('x-real-ip') ||
    '0.0.0.0';
  const userAgent = headersList.get('user-agent') || 'unknown';

  await db.insert(auditLogs).values({
    userId,
    organizationId,
    action,
    entityType,
    entityId,
    details,
    ipAddress,
    userAgent,
    level,
    createdAt: new Date(),
  });
}

// Usage dans Server Action
export async function createTicket(input: unknown) {
  const session = await auth();
  // ... validation et création ...

  await logAudit({
    userId: session?.user?.id || null,
    organizationId: parsed.data.organizationId,
    action: 'ticket_created',
    entityType: 'ticket',
    entityId: ticket.id,
    details: {
      title: ticket.title,
      priority: ticket.priority,
    },
  });
}
```

---

## 14. Dépendances & Vulnerability Management

### 14.1 npm audit CI

- [x] **Vérification à chaque commit**:
  ```bash
  # .github/workflows/security.yml
  name: Security Audit

  on: [push, pull_request]

  jobs:
    audit:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v3
        - uses: actions/setup-node@v3
          with:
            node-version: '20'
        - run: npm ci
        - run: npm audit --audit-level=moderate
        - run: npm run test:security
  ```

- [x] **Fail CI si vulnérabilités trouvées**:
  - `npm audit --audit-level=moderate` = retour 1 si trouvé

### 14.2 Dépendances automatiques

- [x] **Dependabot (GitHub native)**:
  ```yaml
  # .github/dependabot.yml
  version: 2
  updates:
    - package-ecosystem: 'npm'
      directory: '/'
      schedule:
        interval: 'weekly'
        day: 'monday'
        time: '04:00'
      allow:
        - dependency-type: 'all'
      reviewers:
        - 'security-team'
      assignees:
        - 'devops'
  ```

- [x] **Ou Renovate**:
  ```json
  {
    "extends": ["config:base"],
    "schedule": ["after 10pm every weekday"],
    "groupName": "all dependencies",
    "groupSlug": "all",
    "dependencyDashboard": true
  }
  ```

### 14.3 Lock file

- [x] **package-lock.json committé**:
  ```bash
  git add package-lock.json
  git commit -m "deps: update dependencies"
  ```

### 14.4 Audit log dépendances

- [x] **Tracking de versions**:
  ```bash
  npm list > dependency-snapshot.txt
  git add dependency-snapshot.txt
  ```

---

## Checklist d'implémentation complète

### Infrastructure & Déploiement

- [ ] SSH configuré avec clés uniquement
- [ ] Port SSH changé (non-22)
- [ ] UFW firewall activé (80, 443, SSH custom)
- [ ] Fail2ban déployé avec jails SSH + Nginx
- [ ] unattended-upgrades configuré pour mises à jour auto
- [ ] Utilisateur non-root créé pour app (pulseo)
- [ ] systemd service créé pour app

### TLS & Nginx

- [ ] Certificat SSL (Let's Encrypt/acme.sh)
- [ ] TLS 1.2 + 1.3 uniquement activé
- [ ] Ciphers sécurisés configurés
- [ ] HTTP redirection vers HTTPS
- [ ] HSTS header avec preload
- [ ] Rate limiting zones définies (api, login, general)
- [ ] Nginx version cachée (server_tokens off)

### Next.js & Headers

- [ ] next.config.ts headers configuré (X-Content-Type-Options, DENY, etc.)
- [ ] CSP avec nonces implémenté
- [ ] Middleware pour nonce et CSP
- [ ] Permissions-Policy headers ajoutés

### Authentification Better Auth

- [ ] httpOnly, secure, sameSite=lax activés
- [ ] Session duration: 24h gestionnaire, 8h admin
- [ ] Password validation (12 chars, OWASP) avec Zod
- [ ] Rate limiting login (5/15min) en Nginx + Better Auth
- [ ] Trust proxy activé en prod

### Magic Links

- [ ] Table magic_links créée avec champs corrects
- [ ] Tokens générés en UUID v4
- [ ] Tokens hashés avant stockage (SHA-256)
- [ ] Expiration 7 jours validée
- [ ] Révocation admin implémentée
- [ ] max_uses field configurable
- [ ] Usage counter incrémenté

### PostgreSQL RLS

- [ ] RLS activé sur 100% des tables métier
- [ ] Policies SELECT/INSERT/UPDATE/DELETE implémentées
- [ ] SECURITY DEFINER functions créées (schema: private)
- [ ] REVOKE ALL sur anon/public appliqué
- [ ] Authentification role actif en session

### Validation Zero Trust

- [ ] Zod schemas sur tous les Server Actions
- [ ] Zod schemas sur tous les API routes
- [ ] Zod schemas sur tous les form submits
- [ ] Aucun dangerouslySetInnerHTML en codebase
- [ ] react-markdown pour contenu utilisateur
- [ ] Drizzle parameterized queries partout (no raw SQL)
- [ ] CSP nonces générés par requête

### File Upload

- [ ] MIME types whitelist: image/*, pdf
- [ ] Magic bytes validation côté serveur
- [ ] Limite 10MB par fichier
- [ ] Storage en /opt/pulseo-storage/ (hors webroot)
- [ ] Filenames UUID renommés
- [ ] Path traversal prevention
- [ ] Nginx auth_request pour accès fichiers

### IDOR Protection

- [ ] IDs sont UUID v4 (jamais séquentiels)
- [ ] RLS au niveau DB
- [ ] Double vérification: organization membership check dans Server Actions
- [ ] Jamais faire confiance à client-provided org_id seul

### CSRF Protection

- [ ] Server Actions protégés nativement
- [ ] API routes custom avec @edge-csrf/nextjs
- [ ] SameSite=lax sur tous les cookies

### Redirection

- [ ] returnTo parameter validé (chemin relatif seulement)
- [ ] Pas de redirection vers domaines externes depuis auth
- [ ] Whitelist URLs (si externe permitté)

### Qonto Integration

- [ ] Access tokens chiffrés AES-256 en DB
- [ ] Refresh tokens chiffrés aussi
- [ ] Tokens jamais exposés au client
- [ ] Server Actions only pour API calls
- [ ] Refresh token rotation à chaque utilisation
- [ ] Scope minimal: client_invoices.read

### Audit Logging

- [ ] Table audit_logs créée
- [ ] Fonction logAudit() helper
- [ ] Login/logout loggés
- [ ] Ticket create/update/delete loggés
- [ ] File upload/download loggés
- [ ] Magic link operations loggés
- [ ] Qonto sync events loggés
- [ ] IP address + user agent capturés

### Dépendances

- [ ] npm audit en CI (moderate level)
- [ ] Dependabot ou Renovate activé
- [ ] package-lock.json committé
- [ ] Aucune vulnérabilité HIGH+CRITICAL

### Monitoring & Alerting

- [ ] Logs Nginx/app centralisés (ELK / Datadog)
- [ ] Alertes sur failed logins
- [ ] Alertes sur rate limit exceeded
- [ ] Alertes sur audit_logs level=critical
- [ ] Uptime monitoring actif

---

## Références

- OWASP Top 10 2021
- OWASP Testing Guide
- PostgreSQL RLS Documentation
- Next.js Security Best Practices
- Nginx Security Guide
- Better Auth Documentation
- NIST Password Guidelines

---

**Document de contrôle**: Réviser ce checklist tous les 3 mois
**Dernier audit**: 2026-03-27
**Prochaine révision**: 2026-06-27
