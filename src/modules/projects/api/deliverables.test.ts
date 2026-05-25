// @vitest-environment node
/**
 * Tests API routes deliverables — upload streaming + download IDOR + fail-closed.
 *
 * STORAGE_PATH doit être set avant import de storage-adapter (constante
 * module-level PROJECTS_ROOT).
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { promises as fs } from 'fs';
import { Readable } from 'stream';
import path from 'path';
import os from 'os';

const TMP_ROOT = path.join(os.tmpdir(), `pulseo-api-test-${Date.now()}`);
process.env.STORAGE_PATH = TMP_ROOT;

vi.mock('@/lib/db', () => import('@/modules/projects/test/db-test'));
vi.mock('@/lib/auth/session', async (orig) => {
  const actual = (await orig()) as object;
  return { ...actual, getSessionInfo: vi.fn() };
});
vi.mock('@/modules/projects/feature-flag', () => ({
  isProjectsEnabled: () => true,
  isFlowPreviewEnabled: () => false,
  isMsappPreviewEnabled: () => false,
  isSolutionPreviewEnabled: () => false,
  isPbixPreviewEnabled: () => false,
}));
// P4c : mock scan-enqueue pour simuler un scan qui a retourné 'clean' sans
// avoir besoin du sidecar clamav ni du worker graphile-worker. Le mock marque
// directement la row à 'clean' dans proj_documents / proj_deliverables.
vi.mock('@/modules/projects/lib/scan-enqueue', async () => {
  const { db } = await import('@/modules/projects/test/db-test');
  const { projDeliverables, projDocuments } = await import(
    '@/modules/projects/schema/tables'
  );
  const { eq } = await import('drizzle-orm');
  return {
    enqueueVirusScan: async (opts: {
      entityType: 'document' | 'deliverable';
      entityId: string;
    }) => {
      if (opts.entityType === 'document') {
        await db
          .update(projDocuments)
          .set({ virus_scan_status: 'clean' })
          .where(eq(projDocuments.id, opts.entityId));
      } else {
        await db
          .update(projDeliverables)
          .set({ virus_scan_status: 'clean' })
          .where(eq(projDeliverables.id, opts.entityId));
      }
    },
  };
});

import { handleDeliverableUpload, handleDeliverableDownload } from './deliverables';
import { resetStorageAdapter } from '@/modules/projects/lib/storage-adapter';
import { getSessionInfo } from '@/lib/auth/session';
import { resetDb, db, projectsSchema } from '@/modules/projects/test/db-test';
import { makeUser, makeOrg, makeMembership, makeProject } from '@/modules/projects/test/fixtures';
import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';

beforeAll(async () => {
  await fs.mkdir(TMP_ROOT, { recursive: true });
});

afterAll(async () => {
  await fs.rm(TMP_ROOT, { recursive: true, force: true });
});

beforeEach(async () => {
  await resetDb();
  vi.clearAllMocks();
  resetStorageAdapter();
  const projRoot = path.join(TMP_ROOT, 'projects');
  await fs.rm(projRoot, { recursive: true, force: true });
});

function buildUploadReq(opts: {
  projectId: string;
  version?: string;
  originalName?: string;
  mimeType?: string;
  markAsLatest?: boolean;
  body: Buffer;
}): NextRequest {
  const params = new URLSearchParams();
  params.set('projectId', opts.projectId);
  params.set('version', opts.version ?? '1.0');
  params.set('originalName', opts.originalName ?? 'file.pdf');
  params.set('mimeType', opts.mimeType ?? 'application/pdf');
  if (opts.markAsLatest === false) params.set('markAsLatest', 'false');
  const url = `http://localhost/api/projects/deliverables/upload?${params}`;
  const nodeStream = Readable.from([opts.body]);
  // Convertit Node Readable → Web ReadableStream pour simuler un req.body HTTP
  const webStream = Readable.toWeb(nodeStream);
  return {
    url,
    body: webStream,
  } as unknown as NextRequest;
}

function buildDownloadReq(): NextRequest {
  return { url: 'http://localhost/api/projects/deliverables/x/download' } as unknown as NextRequest;
}

async function loginAs(user: { id: string; is_superadmin?: boolean }) {
  vi.mocked(getSessionInfo).mockResolvedValue({
    userId: user.id,
    isSuperadmin: user.is_superadmin ?? false,
  } as never);
}

describe('handleDeliverableUpload', () => {
  it('upload réussi → 201 + row DB + fichier disque', async () => {
    const user = await makeUser();
    const org = await makeOrg();
    await makeMembership(user.id, org.id, 'gestionnaire');
    const project = await makeProject({ organization_id: org.id, created_by: user.id });
    await loginAs(user);

    const body = Buffer.from('%PDF-1.4\nfake pdf content');
    const req = buildUploadReq({ projectId: project.id, body });
    const res = await handleDeliverableUpload(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.sizeBytes).toBe(body.length);
    expect(json.isLatest).toBe(true);

    const rows = await db.select().from(projectsSchema.projDeliverables);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('file');
    expect(rows[0].is_latest).toBe(true);
  });

  it('401 si pas authentifié', async () => {
    vi.mocked(getSessionInfo).mockResolvedValue(null as never);
    const req = buildUploadReq({
      projectId: '00000000-0000-0000-0000-000000000000',
      body: Buffer.from('x'),
    });
    const res = await handleDeliverableUpload(req);
    expect(res.status).toBe(401);
  });

  it('403 pour viewer (IDOR guard)', async () => {
    const user = await makeUser();
    const org = await makeOrg();
    await makeMembership(user.id, org.id, 'viewer');
    const project = await makeProject({ organization_id: org.id, created_by: user.id });
    await loginAs(user);

    const req = buildUploadReq({ projectId: project.id, body: Buffer.from('x') });
    const res = await handleDeliverableUpload(req);
    expect(res.status).toBe(403);
  });

  it('403 pour user cross-org (IDOR)', async () => {
    const userA = await makeUser();
    const userB = await makeUser();
    const orgA = await makeOrg();
    const orgB = await makeOrg();
    await makeMembership(userA.id, orgA.id, 'admin');
    const projectB = await makeProject({ organization_id: orgB.id, created_by: userB.id });
    await loginAs(userA);

    const req = buildUploadReq({ projectId: projectB.id, body: Buffer.from('x') });
    const res = await handleDeliverableUpload(req);
    expect(res.status).toBe(403);
  });

  it('400 si mime non autorisé', async () => {
    const user = await makeUser();
    const org = await makeOrg();
    await makeMembership(user.id, org.id, 'gestionnaire');
    const project = await makeProject({ organization_id: org.id, created_by: user.id });
    await loginAs(user);

    const req = buildUploadReq({
      projectId: project.id,
      mimeType: 'application/x-evil',
      body: Buffer.from('x'),
    });
    const res = await handleDeliverableUpload(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('mime_not_allowed');
  });

  it('400 si version invalide', async () => {
    const user = await makeUser();
    const org = await makeOrg();
    await makeMembership(user.id, org.id, 'gestionnaire');
    const project = await makeProject({ organization_id: org.id, created_by: user.id });
    await loginAs(user);

    const req = buildUploadReq({
      projectId: project.id,
      version: '1.0-beta',
      body: Buffer.from('x'),
    });
    const res = await handleDeliverableUpload(req);
    expect(res.status).toBe(400);
  });

  it('413 si file > maxBytes (category image = 10MB, body = 11MB)', async () => {
    const user = await makeUser();
    const org = await makeOrg();
    await makeMembership(user.id, org.id, 'gestionnaire');
    const project = await makeProject({ organization_id: org.id, created_by: user.id });
    await loginAs(user);

    // 11 MB → dépasse limite image (10MB)
    const bigBuf = Buffer.alloc(11 * 1024 * 1024);
    const req = buildUploadReq({
      projectId: project.id,
      originalName: 'big.png',
      mimeType: 'image/png',
      body: bigBuf,
    });
    const res = await handleDeliverableUpload(req);
    expect(res.status).toBe(413);
  });

  it('upload 2 versions → seule la 2e est is_latest', async () => {
    const user = await makeUser();
    const org = await makeOrg();
    await makeMembership(user.id, org.id, 'gestionnaire');
    const project = await makeProject({ organization_id: org.id, created_by: user.id });
    await loginAs(user);

    await handleDeliverableUpload(
      buildUploadReq({ projectId: project.id, version: '1.0', body: Buffer.from('v1') }),
    );
    await handleDeliverableUpload(
      buildUploadReq({ projectId: project.id, version: '2.0', body: Buffer.from('v2-longer') }),
    );

    const rows = await db
      .select()
      .from(projectsSchema.projDeliverables)
      .where(eq(projectsSchema.projDeliverables.project_id, project.id));
    expect(rows).toHaveLength(2);
    const v1 = rows.find((r) => r.version === '1.0')!;
    const v2 = rows.find((r) => r.version === '2.0')!;
    expect(v1.is_latest).toBe(false);
    expect(v2.is_latest).toBe(true);
  });
});

describe('handleDeliverableDownload', () => {
  async function seedViaUpload(opts: {
    user: { id: string };
    project: { id: string; organization_id: string };
    body: Buffer;
    mimeType?: string;
    version?: string;
  }): Promise<string> {
    await loginAs(opts.user);
    const res = await handleDeliverableUpload(
      buildUploadReq({
        projectId: opts.project.id,
        mimeType: opts.mimeType ?? 'application/pdf',
        version: opts.version ?? '1.0',
        body: opts.body,
      }),
    );
    const json = await res.json();
    return json.id as string;
  }

  it('download streaming → 200 + bytes corrects', async () => {
    const user = await makeUser();
    const org = await makeOrg();
    await makeMembership(user.id, org.id, 'gestionnaire');
    const project = await makeProject({ organization_id: org.id, created_by: user.id });
    const body = Buffer.from('hello world PDF');
    const id = await seedViaUpload({ user, project, body });

    await loginAs(user);
    const res = await handleDeliverableDownload(buildDownloadReq(), {
      params: Promise.resolve({ id }),
    });
    expect(res.status).toBe(200);
    const received = Buffer.from(await res.arrayBuffer());
    expect(received.toString()).toBe('hello world PDF');
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(res.headers.get('Content-Length')).toBe(String(body.length));
    expect(res.headers.get('Content-Disposition')).toContain('attachment');
  });

  it('403 pour viewer', async () => {
    const gestionnaire = await makeUser();
    const viewer = await makeUser();
    const org = await makeOrg();
    await makeMembership(gestionnaire.id, org.id, 'gestionnaire');
    await makeMembership(viewer.id, org.id, 'viewer');
    const project = await makeProject({ organization_id: org.id, created_by: gestionnaire.id });
    const id = await seedViaUpload({ user: gestionnaire, project, body: Buffer.from('x') });

    await loginAs(viewer);
    const res = await handleDeliverableDownload(buildDownloadReq(), {
      params: Promise.resolve({ id }),
    });
    expect(res.status).toBe(403);
  });

  it('403 pour user cross-org (IDOR)', async () => {
    const userA = await makeUser();
    const userB = await makeUser();
    const orgA = await makeOrg();
    const orgB = await makeOrg();
    await makeMembership(userA.id, orgA.id, 'admin');
    await makeMembership(userB.id, orgB.id, 'admin');
    const projectB = await makeProject({ organization_id: orgB.id, created_by: userB.id });
    const id = await seedViaUpload({ user: userB, project: projectB, body: Buffer.from('x') });

    await loginAs(userA);
    const res = await handleDeliverableDownload(buildDownloadReq(), {
      params: Promise.resolve({ id }),
    });
    expect(res.status).toBe(403);
  });

  it('superadmin peut download cross-org', async () => {
    const superadmin = await makeUser({ is_superadmin: true });
    const gestionnaire = await makeUser();
    const org = await makeOrg();
    await makeMembership(gestionnaire.id, org.id, 'gestionnaire');
    const project = await makeProject({ organization_id: org.id, created_by: gestionnaire.id });
    const id = await seedViaUpload({ user: gestionnaire, project, body: Buffer.from('x') });

    await loginAs({ id: superadmin.id, is_superadmin: true });
    const res = await handleDeliverableDownload(buildDownloadReq(), {
      params: Promise.resolve({ id }),
    });
    expect(res.status).toBe(200);
  });

  it('403 fail-closed si virus_scan_status = pending', async () => {
    const user = await makeUser();
    const org = await makeOrg();
    await makeMembership(user.id, org.id, 'gestionnaire');
    const project = await makeProject({ organization_id: org.id, created_by: user.id });
    const id = await seedViaUpload({ user, project, body: Buffer.from('x') });

    // Override le mock "auto-clean" : ramène le status à 'pending'
    await db
      .update(projectsSchema.projDeliverables)
      .set({ virus_scan_status: 'pending' })
      .where(eq(projectsSchema.projDeliverables.id, id));

    await loginAs(user);
    const res = await handleDeliverableDownload(buildDownloadReq(), {
      params: Promise.resolve({ id }),
    });
    expect(res.status).toBe(403);
  });

  it('403 fail-closed si virus_scan_status = infected', async () => {
    const user = await makeUser();
    const org = await makeOrg();
    await makeMembership(user.id, org.id, 'gestionnaire');
    const project = await makeProject({ organization_id: org.id, created_by: user.id });
    const id = await seedViaUpload({ user, project, body: Buffer.from('x') });

    await db
      .update(projectsSchema.projDeliverables)
      .set({ virus_scan_status: 'infected' })
      .where(eq(projectsSchema.projDeliverables.id, id));

    await loginAs(user);
    const res = await handleDeliverableDownload(buildDownloadReq(), {
      params: Promise.resolve({ id }),
    });
    expect(res.status).toBe(403);
  });

  it('403 si deliverable soft-deleted', async () => {
    const user = await makeUser();
    const org = await makeOrg();
    await makeMembership(user.id, org.id, 'gestionnaire');
    const project = await makeProject({ organization_id: org.id, created_by: user.id });
    const id = await seedViaUpload({ user, project, body: Buffer.from('x') });

    await db
      .update(projectsSchema.projDeliverables)
      .set({ deleted_at: new Date() })
      .where(eq(projectsSchema.projDeliverables.id, id));

    await loginAs(user);
    const res = await handleDeliverableDownload(buildDownloadReq(), {
      params: Promise.resolve({ id }),
    });
    expect(res.status).toBe(403);
  });

  it('audit log sur download réussi', async () => {
    const user = await makeUser();
    const org = await makeOrg();
    await makeMembership(user.id, org.id, 'gestionnaire');
    const project = await makeProject({ organization_id: org.id, created_by: user.id });
    const id = await seedViaUpload({ user, project, body: Buffer.from('x') });

    await loginAs(user);
    const res = await handleDeliverableDownload(buildDownloadReq(), {
      params: Promise.resolve({ id }),
    });
    await res.arrayBuffer(); // drain stream pour flusher l'audit

    const logs = await db
      .select()
      .from(projectsSchema.projAuditLogs)
      .where(eq(projectsSchema.projAuditLogs.entity_id, id));
    const downloadLog = logs.find((l) => l.event_type === 'deliverable_downloaded');
    expect(downloadLog).toBeDefined();
  });
});
