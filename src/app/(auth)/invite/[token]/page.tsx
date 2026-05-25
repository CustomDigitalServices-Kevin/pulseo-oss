import { redirect } from "next/navigation";

interface Props {
  params: Promise<{ token: string }>;
}

/**
 * Page legacy neutralisée.
 *
 * Avant cette date, ce composant client appelait `authClient.signIn.magicLink`
 * avec `callbackURL=/clients/<orgSlug>` sans passer par la table Pulseo
 * `invite_links` ni par `/invite/accept/[token]`. Résultat : Better Auth créait
 * une session, redirigeait vers `/clients/<slug>`, mais aucun
 * `organization_members` n'était inséré → la page client retournait
 * `notFound()` → 404 silencieux.
 *
 * Le flow officiel passe désormais exclusivement par `/invite/join/<invite_link_token>`
 * où le token vient de la table `invite_links` Pulseo. Tout lien legacy en
 * circulation vers `/invite/<token>` est redirigé vers ce flow ; si le token
 * n'existe pas en base, la page `/invite/join/[token]` affiche une erreur
 * "Lien invalide ou introuvable" propre plutôt qu'un 404.
 */
export default async function InviteLegacyRedirectPage({ params }: Props) {
  const { token } = await params;
  redirect(`/invite/join/${encodeURIComponent(token)}`);
}
