# Role resolution — guide contributeur

Ce document explique comment Pulseo résout les rôles depuis Phase B+ (Groups + Teams).

## Les 4 couches d'accès

Un user peut accéder à une organisation via 4 chemins indépendants :

1. **Superadmin plateforme** — `users.is_superadmin = true`. Accès à toutes les orgs, toutes les actions. Court-circuit en amont.
2. **Membership direct** — ligne `organization_members` avec `role ∈ {admin, gestionnaire, viewer}`.
3. **Group manager** — ligne `organization_group_managers` sur un groupe qui contient l'org (`organizations.group_id`). Accorde `gestionnaire` sur toutes les orgs du groupe.
4. **Team grant** — user est membre d'une `team_members` row, et la team a un `team_organization_grants` sur l'org. Accorde le rôle du grant (`admin | gestionnaire | viewer`).

## Calcul du rôle effectif

`getEffectiveRole(userId, orgId)` retourne le **plus fort** rôle parmi les 3 sources non-superadmin (UNION ALL en SQL, puis max par rank `admin > gestionnaire > viewer`). Retourne `null` si aucun accès.

Superadmin est une **couche distincte** : `getEffectiveRole` ne le retourne pas — les helpers `canX` court-circuitent superadmin **avant** d'appeler `getEffectiveRole`.

## API à utiliser

### Dans les Server Actions

```typescript
import { getSessionInfo } from '@/lib/auth/session';
import { canAccessOrg, canManageMember, canRemoveMember } from '@/lib/auth/permissions';

const session = await getSessionInfo();
if (!session) throw new Error('Authentification requise');

// Lecture
if (!(await canAccessOrg(session.userId, orgId))) throw new Error('403');

// Manipulation d'un autre membre
if (!(await canManageMember(session.userId, targetUserId, orgId))) throw new Error('403');
if (!(await canRemoveMember(session.userId, targetUserId, orgId))) throw new Error('403');
```

### Pour lister les sources (UX debug, drawer)

```typescript
import { getRoleSources } from '@/lib/auth/effective-role';

const sources = await getRoleSources(userId, orgId);
// RoleSourceEntry[] triée par date ascendante
// Chaque entry : { kind: 'direct' | 'group_manager' | 'team_grant', ... }
```

Utilisé dans `<MemberDetailDrawer>` (section "Explication du rôle effectif").

## Règles anti-escalation (spec §3.3)

| Règle | Description |
|-------|-------------|
| 1 | Un user ne peut manage qu'un membre de rôle **strictement inférieur** au sien. |
| 2 | Self-removal interdit (même superadmin). |
| 3 | Retirer le dernier admin direct d'une org est interdit — seul superadmin peut forcer. |
| 4 | Admin hérité via team grant ne compte pas pour la règle 3. |
| 5 | Superadmin override pour règles 1, 3 (PAS pour règle 2). |

Ces règles sont implémentées dans `canManageMember` + `canRemoveMember`. **Ne pas re-coder** ces checks dans les Server Actions — appeler les helpers.

**Extra check dans updateMemberRole** : les non-superadmin doivent aussi vérifier que le NEW role est `< RANK[actor_role]` (sinon un gestionnaire pourrait promouvoir un viewer en gestionnaire, passant `canManageMember`).

## IDOR guard standard

Pour toute action qui prend un `resource_id` en input :

1. `getSessionInfo()` → 401 si null
2. `z.parse(input)` → 400 si invalide
3. **Fetch resource par ID**
4. **Utiliser `resource.organization_id` dans le check d'accès** (JAMAIS un `orgId` venant de l'input)
5. `canX(session.userId, resource.organization_id)` → 403 si faux
6. Vérifier que toute ressource **référencée** (ex: `contract_id` dans createTicket) appartient au même `organization_id`
7. Logique métier

## Legacy `requireRole` (deprecated)

`src/lib/auth/roles.ts` — marqué `@deprecated`, check **direct membership uniquement**. Encore utilisé dans `tickets.ts`, `comments.ts`, `attachments.ts`, `documents.ts`, `contracts.ts`. **Gap connu** : group managers et team members sont bloqués sur ces actions même quand Phase F leur accorde l'accès. Refactor H5 prévu.

Pour une nouvelle action, utiliser **uniquement** les helpers de `permissions.ts`.

## Tests

Voir `src/lib/auth/effective-role.test.ts` et `src/lib/auth/permissions.test.ts` pour les patterns PGlite.

Helpers fixtures : `src/test/fixtures.ts` — `makeUser`, `makeOrg`, `makeGroup(name?)`, `makeTeam(createdBy, name?)`, `addMember`, `addGroupManager`, `addTeamMember`, `addTeamGrant`.
