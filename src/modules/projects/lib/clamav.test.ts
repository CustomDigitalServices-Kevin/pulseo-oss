// @vitest-environment node
/**
 * Tests protocole clamd INSTREAM. Simule clamd via un mini-serveur TCP local
 * qui répond avec les messages clamd attendus.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer, type Server } from 'net';
import { Readable } from 'stream';
import { scanStream, pingClamd } from './clamav';

let server: Server;
let port: number;

/**
 * Mock clamd server. Le handler reçoit les bytes buffered (toutes les data
 * events concaténées) et un `send` + `end`. Il est appelé après un court
 * debounce (50ms sans nouvelles data) — simule la réception complète du
 * stream INSTREAM.
 */
async function startMockServer(
  handler: (buffered: Buffer, send: (data: Buffer | string) => void, end: () => void) => void,
): Promise<number> {
  return new Promise((resolve) => {
    server = createServer((socket) => {
      const bufs: Buffer[] = [];
      let timer: NodeJS.Timeout | null = null;
      const flush = () => {
        handler(
          Buffer.concat(bufs),
          (data) => socket.write(typeof data === 'string' ? Buffer.from(data) : data),
          () => socket.end(),
        );
      };
      socket.on('data', (chunk) => {
        bufs.push(chunk);
        if (timer) clearTimeout(timer);
        timer = setTimeout(flush, 50);
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      port = typeof addr === 'object' && addr ? addr.port : 3310;
      resolve(port);
    });
  });
}

beforeEach(() => {
  process.env.CLAMAV_HOST = '127.0.0.1';
  process.env.CLAMAV_TIMEOUT_MS = '5000';
});

afterEach(
  () =>
    new Promise<void>((resolve) => {
      if (server && server.listening) server.close(() => resolve());
      else resolve();
    }),
);

describe('scanStream', () => {
  it('retourne clean sur stream:OK', async () => {
    const p = await startMockServer((_buf, send, end) => {
      send(Buffer.from('stream: OK\0'));
      end();
    });
    process.env.CLAMAV_PORT = String(p);

    const result = await scanStream(Readable.from([Buffer.from('hello')]));
    expect(result.status).toBe('clean');
  });

  it('retourne infected avec signature', async () => {
    const p = await startMockServer((_buf, send, end) => {
      send(Buffer.from('stream: Eicar-Test-Signature FOUND\0'));
      end();
    });
    process.env.CLAMAV_PORT = String(p);

    const result = await scanStream(Readable.from([Buffer.from('virus')]));
    expect(result.status).toBe('infected');
    if (result.status === 'infected') {
      expect(result.signature).toBe('Eicar-Test-Signature');
    }
  });

  it('retourne error sur timeout', async () => {
    // Server qui ne répond jamais
    const p = await startMockServer(() => {
      /* noop — silence est d'or */
    });
    process.env.CLAMAV_PORT = String(p);
    process.env.CLAMAV_TIMEOUT_MS = '200';

    const result = await scanStream(Readable.from([Buffer.from('x')]));
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.reason).toContain('timeout');
    }
  });

  it('retourne error sur réponse inattendue', async () => {
    const p = await startMockServer((_buf, send, end) => {
      send(Buffer.from('???\0'));
      end();
    });
    process.env.CLAMAV_PORT = String(p);

    const result = await scanStream(Readable.from([Buffer.from('x')]));
    expect(result.status).toBe('error');
  });
});

describe('pingClamd', () => {
  it('retourne true sur PONG', async () => {
    const p = await startMockServer((_buf, send, end) => {
      send(Buffer.from('PONG\0'));
      end();
    });
    process.env.CLAMAV_PORT = String(p);

    expect(await pingClamd()).toBe(true);
  });

  it('retourne false sur serveur absent', async () => {
    process.env.CLAMAV_PORT = '1'; // port fermé
    process.env.CLAMAV_TIMEOUT_MS = '200';
    expect(await pingClamd()).toBe(false);
  });
});
