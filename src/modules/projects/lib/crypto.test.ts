// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { encryptToken, decryptToken, currentKeyVersion } from './crypto';
import { randomBytes } from 'node:crypto';

function setKey(version: number | null, keyBase64?: string) {
  if (version === 1 || version === null) {
    delete process.env.PROJECTS_ENCRYPTION_KEY;
    if (keyBase64) process.env.PROJECTS_ENCRYPTION_KEY = keyBase64;
  }
  if (version && version > 1) {
    const varName = `PROJECTS_ENCRYPTION_KEY_V${version}`;
    delete process.env[varName];
    if (keyBase64) process.env[varName] = keyBase64;
  }
}

function freshKey(): string {
  return randomBytes(32).toString('base64');
}

beforeEach(() => {
  delete process.env.PROJECTS_ENCRYPTION_KEY;
  delete process.env.PROJECTS_ENCRYPTION_KEY_V2;
  delete process.env.PROJECTS_ENCRYPTION_KEY_VERSION;
});

describe('encryptToken + decryptToken', () => {
  it('roundtrip ghp_token', () => {
    setKey(1, freshKey());
    const token = 'ghp_abcdefghijklmnopqrstuvwxyz1234567890AB';
    const blob = encryptToken(token, 1);
    const r = decryptToken(blob, 1);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.plaintext).toBe(token);
  });

  it('layout nonce(12) + ct(n) + tag(16)', () => {
    setKey(1, freshKey());
    const token = 'test';
    const blob = encryptToken(token, 1);
    // token UTF-8 = 4 bytes → blob = 12 + 4 + 16 = 32
    expect(blob.length).toBe(32);
  });

  it('nonce unique à chaque encrypt', () => {
    setKey(1, freshKey());
    const token = 'same token';
    const a = encryptToken(token, 1);
    const b = encryptToken(token, 1);
    expect(Buffer.compare(a, b)).not.toBe(0);
    // Les 12 premiers bytes (nonce) doivent différer
    expect(Buffer.compare(a.subarray(0, 12), b.subarray(0, 12))).not.toBe(0);
  });

  it('decrypt avec mauvaise clé → decrypt_failed', () => {
    setKey(1, freshKey());
    const blob = encryptToken('secret', 1);
    setKey(1, freshKey()); // change la clé
    const r = decryptToken(blob, 1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('decrypt_failed');
  });

  it('decrypt blob tampered → decrypt_failed (authTag check)', () => {
    setKey(1, freshKey());
    const blob = encryptToken('secret', 1);
    // Flip un bit du ciphertext
    blob[20] ^= 0xff;
    const r = decryptToken(blob, 1);
    expect(r.ok).toBe(false);
  });

  it('decrypt blob trop court → decrypt_failed', () => {
    setKey(1, freshKey());
    const r = decryptToken(Buffer.alloc(5), 1);
    expect(r.ok).toBe(false);
  });

  it('throw si PROJECTS_ENCRYPTION_KEY absente', () => {
    expect(() => encryptToken('x', 1)).toThrow(/missing_encryption_key/);
  });

  it('throw si clé != 32 bytes', () => {
    process.env.PROJECTS_ENCRYPTION_KEY = Buffer.from('short').toString('base64');
    expect(() => encryptToken('x', 1)).toThrow(/invalid_encryption_key/);
  });

  it('empty plaintext → throw', () => {
    setKey(1, freshKey());
    expect(() => encryptToken('', 1)).toThrow('empty_plaintext');
  });

  it('key rotation v1 encrypt → v2 encrypt, decrypt avec bonne version', () => {
    setKey(1, freshKey());
    setKey(2, freshKey());
    const v1Blob = encryptToken('token_v1', 1);
    const v2Blob = encryptToken('token_v2', 2);
    expect(decryptToken(v1Blob, 1).ok).toBe(true);
    expect(decryptToken(v2Blob, 2).ok).toBe(true);
    // cross-version = decrypt_failed
    expect(decryptToken(v1Blob, 2).ok).toBe(false);
    expect(decryptToken(v2Blob, 1).ok).toBe(false);
  });
});

describe('currentKeyVersion', () => {
  it('default 1 si env absent', () => {
    expect(currentKeyVersion()).toBe(1);
  });

  it('lit env PROJECTS_ENCRYPTION_KEY_VERSION', () => {
    process.env.PROJECTS_ENCRYPTION_KEY_VERSION = '2';
    expect(currentKeyVersion()).toBe(2);
  });

  it('fallback 1 si env invalide', () => {
    process.env.PROJECTS_ENCRYPTION_KEY_VERSION = 'abc';
    expect(currentKeyVersion()).toBe(1);
  });
});
