/**
 * Client clamd TCP — protocole INSTREAM.
 *
 * Le sidecar Docker `clamav/clamav:1.3.0` écoute sur TCP (port par défaut
 * 3310). Config via `CLAMAV_HOST` + `CLAMAV_PORT`.
 *
 * Protocole (clamd.h §INSTREAM) :
 *   Client envoie : `zINSTREAM\0`
 *   Puis chunks : `<size:4 bytes big-endian><data>`
 *   Puis terminator : `\0\0\0\0` (size=0)
 *   Serveur répond : `stream: OK\0` ou `stream: <signature> FOUND\0`
 *
 * Timeout 30s obligatoire (spec §"Virus scan"). Si sidecar unreachable ou
 * lent → `{status: 'error'}` et le caller décide (ne jamais laisser 'pending'
 * indéfiniment — le worker retry selon sa policy).
 */
import { Socket } from 'net';
import { Readable } from 'stream';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 3310;
const DEFAULT_TIMEOUT_MS = 30_000;

export type ScanResult =
  | { status: 'clean' }
  | { status: 'infected'; signature: string }
  | { status: 'error'; reason: string };

function getConfig() {
  return {
    host: process.env.CLAMAV_HOST || DEFAULT_HOST,
    port: Number(process.env.CLAMAV_PORT) || DEFAULT_PORT,
    timeoutMs: Number(process.env.CLAMAV_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
  };
}

/**
 * Scan un Readable stream via clamd INSTREAM. Renvoie clean/infected/error
 * sans jamais throw (caller handle via status discriminated).
 */
export async function scanStream(stream: Readable): Promise<ScanResult> {
  const { host, port, timeoutMs } = getConfig();
  return new Promise<ScanResult>((resolve) => {
    const socket = new Socket();
    const buffers: Buffer[] = [];
    let settled = false;

    const settle = (result: ScanResult) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);

    socket.once('timeout', () => settle({ status: 'error', reason: 'socket_timeout' }));
    socket.once('error', (err) =>
      settle({ status: 'error', reason: `socket_error: ${err.message}` }),
    );

    socket.on('data', (chunk) => buffers.push(chunk));

    socket.once('end', () => {
      const response = Buffer.concat(buffers).toString('utf8').replace(/\0$/, '').trim();
      if (/stream:\s*OK/.test(response)) return settle({ status: 'clean' });
      const match = response.match(/stream:\s*(\S.*?)\s*FOUND/);
      if (match) return settle({ status: 'infected', signature: match[1] });
      settle({ status: 'error', reason: `unexpected_response: ${response}` });
    });

    socket.connect(port, host, () => {
      // Commande INSTREAM (préfixe 'z' = newline-terminated commande)
      socket.write('zINSTREAM\0');

      // Pipe chunks : <size u32 BE><chunk>, puis <0><0><0><0>
      stream.on('data', (chunk: Buffer) => {
        if (settled) return;
        const header = Buffer.alloc(4);
        header.writeUInt32BE(chunk.length, 0);
        socket.write(header);
        socket.write(chunk);
      });
      stream.once('end', () => {
        if (settled) return;
        const terminator = Buffer.alloc(4); // all zeros
        socket.write(terminator);
      });
      stream.once('error', (err) =>
        settle({ status: 'error', reason: `stream_error: ${err.message}` }),
      );
    });
  });
}

/**
 * Ping clamd (PING command). Utile pour health-check PM2 + logs boot worker.
 */
export async function pingClamd(): Promise<boolean> {
  const { host, port, timeoutMs } = getConfig();
  return new Promise<boolean>((resolve) => {
    const socket = new Socket();
    socket.setTimeout(timeoutMs);
    socket.once('error', () => resolve(false));
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('data', (chunk) => {
      const response = chunk.toString('utf8').replace(/\0$/, '').trim();
      socket.destroy();
      resolve(response === 'PONG');
    });
    socket.connect(port, host, () => {
      socket.write('zPING\0');
    });
  });
}
