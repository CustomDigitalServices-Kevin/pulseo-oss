import { describe, it, expect } from 'vitest';
import {
  validateMimeType,
  validateMagicBytes,
  validateFileSize,
  sanitizeFilename,
  isLogoMimeAllowed,
  validateSvgContent,
  validateLogoFile,
  LOGO_MAX_SIZE,
} from './file-validation';

describe('validateMimeType', () => {
  it('accepts allowed image MIME types', () => {
    expect(validateMimeType('image/jpeg')).toBe(true);
    expect(validateMimeType('image/png')).toBe(true);
    expect(validateMimeType('image/gif')).toBe(true);
    expect(validateMimeType('image/webp')).toBe(true);
  });

  it('accepts PDF', () => {
    expect(validateMimeType('application/pdf')).toBe(true);
  });

  it('accepts text and Office documents', () => {
    expect(validateMimeType('text/plain')).toBe(true);
    expect(validateMimeType('application/msword')).toBe(true);
    expect(
      validateMimeType(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      )
    ).toBe(true);
  });

  it('rejects executables', () => {
    expect(validateMimeType('application/x-msdownload')).toBe(false);
    expect(validateMimeType('application/x-executable')).toBe(false);
  });

  it('rejects scripts', () => {
    expect(validateMimeType('application/javascript')).toBe(false);
    expect(validateMimeType('text/html')).toBe(false);
  });

  it('rejects empty MIME type', () => {
    expect(validateMimeType('')).toBe(false);
  });
});

describe('validateMagicBytes', () => {
  it('detects valid JPEG header (FF D8 FF)', () => {
    const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
    expect(validateMagicBytes(buffer, 'image/jpeg')).toBe(true);
  });

  it('detects valid PNG header (89 50 4E 47)', () => {
    const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
    expect(validateMagicBytes(buffer, 'image/png')).toBe(true);
  });

  it('detects valid PDF header (25 50 44 46 = "%PDF")', () => {
    const buffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]);
    expect(validateMagicBytes(buffer, 'application/pdf')).toBe(true);
  });

  it('rejects fake JPEG with PNG bytes', () => {
    const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    expect(validateMagicBytes(buffer, 'image/jpeg')).toBe(false);
  });

  it('rejects fake PDF with JPEG bytes', () => {
    const buffer = Buffer.from([0xff, 0xd8, 0xff]);
    expect(validateMagicBytes(buffer, 'application/pdf')).toBe(false);
  });

  it('returns true for MIME types with no defined magic bytes', () => {
    const buffer = Buffer.from([0x00, 0x00, 0x00]);
    expect(validateMagicBytes(buffer, 'text/plain')).toBe(true);
  });
});

describe('validateFileSize', () => {
  const MAX = 10 * 1024 * 1024;

  it('accepts a 1KB file', () => {
    expect(validateFileSize(1024)).toBe(true);
  });

  it('accepts a 5MB file', () => {
    expect(validateFileSize(5 * 1024 * 1024)).toBe(true);
  });

  it('accepts exactly 10MB', () => {
    expect(validateFileSize(MAX)).toBe(true);
  });

  it('rejects 10MB + 1 byte', () => {
    expect(validateFileSize(MAX + 1)).toBe(false);
  });

  it('rejects 100MB', () => {
    expect(validateFileSize(100 * 1024 * 1024)).toBe(false);
  });

  it('accepts 0 bytes (boundary)', () => {
    expect(validateFileSize(0)).toBe(true);
  });
});

describe('sanitizeFilename', () => {
  it('keeps alphanumeric and allowed punctuation', () => {
    expect(sanitizeFilename('document.pdf')).toBe('document.pdf');
    expect(sanitizeFilename('my-file_v2.png')).toBe('my-file_v2.png');
  });

  it('replaces spaces with underscore', () => {
    expect(sanitizeFilename('mon document.pdf')).toBe('mon_document.pdf');
  });

  it('replaces special characters with underscore', () => {
    expect(sanitizeFilename("rapport(final)#1.pdf")).toBe('rapport_final__1.pdf');
  });

  it('replaces accented characters', () => {
    expect(sanitizeFilename('résumé.pdf')).toBe('r_sum_.pdf');
  });

  it('blocks path traversal attempts', () => {
    // Leading dots are replaced (no hidden files). Inner dots preserved, then
    // non-alphanum chars replaced.
    expect(sanitizeFilename('../../etc/passwd')).toBe('__.._etc_passwd');
    expect(sanitizeFilename('/etc/shadow')).toBe('_etc_shadow');
  });

  it('blocks Unix hidden-file names (leading dots)', () => {
    expect(sanitizeFilename('.htaccess')).toBe('_htaccess');
    expect(sanitizeFilename('.env')).toBe('_env');
    expect(sanitizeFilename('..bashrc')).toBe('_bashrc');
  });

  it('returns a safe default for an empty/fully-stripped name', () => {
    expect(sanitizeFilename('')).toBe('file');
    expect(sanitizeFilename('...')).toBe('_');
  });

  it('truncates filenames longer than 200 chars', () => {
    const longName = 'a'.repeat(300) + '.pdf';
    const result = sanitizeFilename(longName);
    expect(result.length).toBe(200);
  });

  it('preserves filenames at exactly 200 chars', () => {
    const name = 'a'.repeat(196) + '.pdf';
    expect(sanitizeFilename(name).length).toBe(200);
  });
});

// ─── Logo upload — Lot 3 ─────────────────────────────────────────────────

const PNG_HEAD = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_HEAD = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
const WEBP_HEAD = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);
const FAKE_HEAD = Buffer.from([0x00, 0x01, 0x02, 0x03]);

function fileFrom(buffer: Buffer, type: string, name = 'logo.bin', size?: number): File {
  // Copie pour matérialiser un ArrayBuffer pur (le slice de l'underlying
  // .buffer peut être SharedArrayBuffer selon l'environnement, ce que
  // l'API File rejette en TS).
  const copy = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(copy).set(buffer);
  const file = new File([copy], name, { type });
  if (size !== undefined) {
    Object.defineProperty(file, 'size', { value: size, configurable: true });
  }
  return file;
}

describe('isLogoMimeAllowed', () => {
  it('accepts PNG, JPEG, WebP, SVG only', () => {
    expect(isLogoMimeAllowed('image/png')).toBe(true);
    expect(isLogoMimeAllowed('image/jpeg')).toBe(true);
    expect(isLogoMimeAllowed('image/webp')).toBe(true);
    expect(isLogoMimeAllowed('image/svg+xml')).toBe(true);
    expect(isLogoMimeAllowed('image/gif')).toBe(false);
    expect(isLogoMimeAllowed('application/pdf')).toBe(false);
  });
});

describe('validateSvgContent', () => {
  it('accepts a clean <svg> element', () => {
    expect(
      validateSvgContent(
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><circle/></svg>', 'utf8'),
      ),
    ).toBe(true);
  });
  it('accepts a SVG with XML prolog', () => {
    expect(
      validateSvgContent(Buffer.from('<?xml version="1.0"?><svg/>', 'utf8')),
    ).toBe(true);
  });
  it('rejects HTML disguised as SVG', () => {
    expect(validateSvgContent(Buffer.from('<html><body>x</body></html>', 'utf8'))).toBe(false);
  });
  it('rejects raw binary disguised as SVG', () => {
    expect(validateSvgContent(PNG_HEAD)).toBe(false);
  });
  it('rejects DTD-first payload (XXE attempt)', () => {
    expect(
      validateSvgContent(
        Buffer.from(
          '<!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg/>',
          'utf8',
        ),
      ),
    ).toBe(false);
  });
});

describe('validateLogoFile', () => {
  it('rejects oversized files', async () => {
    const file = fileFrom(PNG_HEAD, 'image/png', 'big.png', LOGO_MAX_SIZE + 1);
    const r = await validateLogoFile(file);
    expect(r.valid).toBe(false);
  });
  it('rejects mime not in logo whitelist', async () => {
    const r = await validateLogoFile(fileFrom(PNG_HEAD, 'image/gif'));
    expect(r.valid).toBe(false);
  });
  it('accepts a valid PNG', async () => {
    const r = await validateLogoFile(fileFrom(PNG_HEAD, 'image/png'));
    expect(r.valid).toBe(true);
    if (r.valid) expect(r.mime).toBe('image/png');
  });
  it('accepts a valid JPEG', async () => {
    const r = await validateLogoFile(fileFrom(JPEG_HEAD, 'image/jpeg'));
    expect(r.valid).toBe(true);
  });
  it('accepts a valid WebP', async () => {
    const r = await validateLogoFile(fileFrom(WEBP_HEAD, 'image/webp'));
    expect(r.valid).toBe(true);
  });
  it('accepts a valid SVG and exposes its UTF-8 text', async () => {
    const buf = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'utf8');
    const r = await validateLogoFile(fileFrom(buf, 'image/svg+xml'));
    expect(r.valid).toBe(true);
    if (r.valid) expect(r.svgText).toContain('<svg');
  });
  it('rejects a binary file masquerading as PNG', async () => {
    const r = await validateLogoFile(fileFrom(FAKE_HEAD, 'image/png'));
    expect(r.valid).toBe(false);
  });
});
