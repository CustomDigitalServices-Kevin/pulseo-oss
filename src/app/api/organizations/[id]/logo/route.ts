import { NextResponse } from 'next/server';
import { writeFile, readFile } from 'node:fs/promises';
import { z } from 'zod';
import { db } from '@/lib/db';
import { organizations as organizationsTable } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { requireSession, requireAdmin } from '@/lib/auth/session';
import { canAccessOrg } from '@/lib/auth/permissions';
import { validateLogoFile } from '@/lib/utils/file-validation';
import { sanitizeSvg } from '@/lib/utils/svg-sanitize';
import { detectLogoBackground } from '@/lib/logo/auto-detect';
import {
  MIME_TO_EXT,
  deleteAllLogosFor,
  findLogo,
  getLogosDir,
  logoPathFor,
} from '@/lib/logo/storage';
import { createAuditLog } from '@/lib/utils/audit';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const orgIdSchema = z.string().uuid();

// Update partiel : au moins un des champs doit être présent. Permet à
// LogoUploader de POST {logo_background} OU {logo_shape} OU {logo_size} OU
// une combinaison sans avoir à tout renvoyer.
const updateMetaSchema = z
  .object({
    logo_background: z.enum(['auto', 'light', 'dark', 'transparent']).optional(),
    logo_shape: z.enum(['square', 'rect']).optional(),
    logo_size: z.enum(['sm', 'md', 'lg']).optional(),
  })
  .refine(
    (data) =>
      data.logo_background !== undefined ||
      data.logo_shape !== undefined ||
      data.logo_size !== undefined,
    { message: 'Aucun champ à mettre à jour' },
  );

const EXT_TO_MIME: Record<string, string> = Object.fromEntries(
  Object.entries(MIME_TO_EXT).map(([mime, ext]) => [ext, mime]),
);

/**
 * GET — sert le logo d'une organisation à tout user qui a accès à cette org.
 * Le logo n'est pas considéré comme une donnée sensible (URL sur le site
 * client, brand asset). Cache court pour permettre le refresh après ré-upload.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const parsed = orgIdSchema.safeParse(id);
  if (!parsed.success) return new NextResponse('Invalid id', { status: 400 });

  const session = await requireSession();
  const isAccess = await canAccessOrg(session.user.id, parsed.data);
  if (!isAccess) return new NextResponse('Not authorized', { status: 403 });

  const found = await findLogo(parsed.data);
  if (!found) return new NextResponse('Not Found', { status: 404 });

  const buf = await readFile(found.path);
  const body = new Uint8Array(buf);
  const mime = EXT_TO_MIME[found.ext] ?? 'application/octet-stream';

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': mime,
      'Content-Length': String(body.length),
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=300, must-revalidate',
    },
  });
}

/**
 * POST — upload d'un logo (superadmin only, cohérent avec updateOrganization).
 * Accepte multipart/form-data (champ `file`) OU application/json pour ne mettre
 * à jour que le `logo_background` quand le fichier existe déjà.
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const parsed = orgIdSchema.safeParse(id);
    if (!parsed.success) {
      return NextResponse.json({ error: 'ID invalide' }, { status: 400 });
    }
    const orgId = parsed.data;
    const session = await requireAdmin();

    const contentType = request.headers.get('content-type') ?? '';

    // Branche A : update meta (background / shape / size) sans fichier.
    if (contentType.includes('application/json')) {
      const body = await request.json();
      const meta = updateMetaSchema.safeParse(body);
      if (!meta.success) {
        return NextResponse.json({ error: 'Champs invalides' }, { status: 400 });
      }
      const set: Record<string, unknown> = { updated_at: new Date() };
      if (meta.data.logo_background !== undefined) set.logo_background = meta.data.logo_background;
      if (meta.data.logo_shape !== undefined) set.logo_shape = meta.data.logo_shape;
      if (meta.data.logo_size !== undefined) set.logo_size = meta.data.logo_size;
      await db
        .update(organizationsTable)
        .set(set)
        .where(eq(organizationsTable.id, orgId));
      await createAuditLog({
        actorId: session.user.id,
        orgId,
        action: 'logo_meta_updated',
        entityType: 'organization',
        entityId: orgId,
        changes: meta.data,
      });
      return NextResponse.json({ ok: true });
    }

    // Branche B : upload de fichier
    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Fichier manquant' }, { status: 400 });
    }

    const validated = await validateLogoFile(file);
    if (!validated.valid) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    // Préparer le buffer final : SVG passe par DOMPurify pour neutraliser
    // <script>, on*, javascript:, foreignObject. Les bitmaps sont écrits tels
    // quels (les magic-bytes ont déjà confirmé le format).
    const finalBuffer =
      validated.mime === 'image/svg+xml' && validated.svgText !== undefined
        ? Buffer.from(sanitizeSvg(validated.svgText), 'utf8')
        : validated.buffer;

    const ext = MIME_TO_EXT[validated.mime];
    if (!ext) {
      return NextResponse.json({ error: 'MIME non supporté' }, { status: 400 });
    }

    // Supprimer un éventuel logo précédent (autre extension) pour ne pas
    // garder un orphan.
    await deleteAllLogosFor(orgId);
    const dir = await getLogosDir();
    const target = logoPathFor(orgId, dir, ext);
    await writeFile(target, finalBuffer);

    // Auto-detect du fond si l'org est en mode auto. Pour SVG, retourne
    // 'light' faute de pixels analysables.
    const [orgRow] = await db
      .select({ logo_background: organizationsTable.logo_background })
      .from(organizationsTable)
      .where(eq(organizationsTable.id, orgId))
      .limit(1);
    let resolvedBg: 'auto' | 'light' | 'dark' | 'transparent' =
      orgRow?.logo_background ?? 'auto';
    if (resolvedBg === 'auto') {
      try {
        resolvedBg = await detectLogoBackground(finalBuffer, validated.mime);
      } catch (e) {
        logger.warn('[LOGO] auto-detect failed, defaulting to light', {
          err: e instanceof Error ? e.message : String(e),
        });
        resolvedBg = 'light';
      }
    }

    // L'URL servie au browser pointe sur cette même route, avec un
    // cache-bust temporel pour forcer le refresh côté client.
    const logoUrl = `/api/organizations/${orgId}/logo?v=${Date.now()}`;

    await db
      .update(organizationsTable)
      .set({
        logo_url: logoUrl,
        logo_mime: validated.mime,
        logo_background: resolvedBg,
        updated_at: new Date(),
      })
      .where(eq(organizationsTable.id, orgId));

    await createAuditLog({
      actorId: session.user.id,
      orgId,
      action: 'logo_uploaded',
      entityType: 'organization',
      entityId: orgId,
      changes: { mime: validated.mime, logo_background: resolvedBg },
    });

    return NextResponse.json({
      ok: true,
      logo_url: logoUrl,
      logo_mime: validated.mime,
      logo_background: resolvedBg,
    });
  } catch (e) {
    logger.error('[LOGO] upload failed', {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(
      { error: "Erreur lors de l'upload du logo" },
      { status: 500 },
    );
  }
}

/**
 * DELETE — retire le logo (fichier disque + colonnes DB). Superadmin only.
 */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const parsed = orgIdSchema.safeParse(id);
    if (!parsed.success) {
      return NextResponse.json({ error: 'ID invalide' }, { status: 400 });
    }
    const session = await requireAdmin();
    const orgId = parsed.data;

    await deleteAllLogosFor(orgId);
    await db
      .update(organizationsTable)
      .set({
        logo_url: null,
        logo_mime: null,
        logo_background: 'auto',
        updated_at: new Date(),
      })
      .where(eq(organizationsTable.id, orgId));

    await createAuditLog({
      actorId: session.user.id,
      orgId,
      action: 'logo_deleted',
      entityType: 'organization',
      entityId: orgId,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error('[LOGO] delete failed', {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(
      { error: 'Erreur lors de la suppression du logo' },
      { status: 500 },
    );
  }
}
