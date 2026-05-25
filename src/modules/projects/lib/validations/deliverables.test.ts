import { describe, it, expect } from 'vitest';
import {
  uploadDeliverableMetaSchema,
  listDeliverablesInputSchema,
  categorizeDeliverable,
  DELIVERABLE_SIZE_LIMITS,
  VERSION_REGEX,
} from './deliverables';

const UUID = '00000000-0000-4000-8000-000000000001';

describe('uploadDeliverableMetaSchema', () => {
  it('accepte version N.N', () => {
    const r = uploadDeliverableMetaSchema.safeParse({
      projectId: UUID,
      version: '1.0',
      originalName: 'file.pdf',
      mimeType: 'application/pdf',
    });
    expect(r.success).toBe(true);
  });

  it('accepte version N.N.N', () => {
    const r = uploadDeliverableMetaSchema.safeParse({
      projectId: UUID,
      version: '2.5.12',
      originalName: 'file.pdf',
      mimeType: 'application/pdf',
    });
    expect(r.success).toBe(true);
  });

  it('rejette version avec suffixe beta', () => {
    const r = uploadDeliverableMetaSchema.safeParse({
      projectId: UUID,
      version: '1.0-beta',
      originalName: 'file.pdf',
      mimeType: 'application/pdf',
    });
    expect(r.success).toBe(false);
  });

  it('rejette version vide', () => {
    const r = uploadDeliverableMetaSchema.safeParse({
      projectId: UUID,
      version: '',
      originalName: 'file.pdf',
      mimeType: 'application/pdf',
    });
    expect(r.success).toBe(false);
  });

  it('rejette projectId non-uuid', () => {
    const r = uploadDeliverableMetaSchema.safeParse({
      projectId: 'not-a-uuid',
      version: '1.0',
      originalName: 'file.pdf',
      mimeType: 'application/pdf',
    });
    expect(r.success).toBe(false);
  });

  it('rejette originalName vide', () => {
    const r = uploadDeliverableMetaSchema.safeParse({
      projectId: UUID,
      version: '1.0',
      originalName: '',
      mimeType: 'application/pdf',
    });
    expect(r.success).toBe(false);
  });

  it('markAsLatest défaut true', () => {
    const r = uploadDeliverableMetaSchema.safeParse({
      projectId: UUID,
      version: '1.0',
      originalName: 'file.pdf',
      mimeType: 'application/pdf',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.markAsLatest).toBe(true);
  });
});

describe('VERSION_REGEX', () => {
  it.each([
    ['1.0', true],
    ['1.0.0', true],
    ['99.99.99', true],
    ['0.1', true],
    ['1', false],
    ['1.0.0.0', false],
    ['v1.0', false],
    ['1.0-alpha', false],
    ['abc', false],
    ['1.0.', false],
  ])('VERSION_REGEX.test(%s) = %s', (input, expected) => {
    expect(VERSION_REGEX.test(input)).toBe(expected);
  });
});

describe('categorizeDeliverable', () => {
  it('.pdf → pdf', () => {
    expect(categorizeDeliverable('report.pdf', 'application/pdf')).toBe('pdf');
  });

  it('.pbix → pbix (200MB)', () => {
    expect(categorizeDeliverable('dashboard.pbix', 'application/octet-stream')).toBe('pbix');
    expect(DELIVERABLE_SIZE_LIMITS.pbix).toBe(200 * 1024 * 1024);
  });

  it('.msapp → msapp (50MB)', () => {
    expect(categorizeDeliverable('app.msapp', 'application/zip')).toBe('msapp');
    expect(DELIVERABLE_SIZE_LIMITS.msapp).toBe(50 * 1024 * 1024);
  });

  it('.docx → office', () => {
    expect(
      categorizeDeliverable(
        'doc.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ),
    ).toBe('office');
  });

  it('.zip sans extension spécifique → solution (500MB conservative)', () => {
    expect(categorizeDeliverable('package.zip', 'application/zip')).toBe('solution');
  });

  it('.png → image (10MB)', () => {
    expect(categorizeDeliverable('screenshot.PNG', 'image/png')).toBe('image');
    expect(DELIVERABLE_SIZE_LIMITS.image).toBe(10 * 1024 * 1024);
  });

  it('inconnu → other (50MB)', () => {
    expect(categorizeDeliverable('file.xyz', 'application/custom')).toBe('other');
  });

  it('extension prime sur mime (MSAPP = ZIP)', () => {
    // Un MSAPP arrive avec mime 'application/zip' mais extension .msapp
    expect(categorizeDeliverable('app.msapp', 'application/zip')).toBe('msapp');
  });
});

describe('listDeliverablesInputSchema', () => {
  it('includeDeleted défaut false', () => {
    const r = listDeliverablesInputSchema.safeParse({ projectId: UUID });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.includeDeleted).toBe(false);
  });

  it('accepte includeDeleted=true', () => {
    const r = listDeliverablesInputSchema.safeParse({ projectId: UUID, includeDeleted: true });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.includeDeleted).toBe(true);
  });
});
