/**
 * Lightweight structured logger for Pulseo.
 *
 * - JSON output in production (parseable by log aggregators)
 * - Pretty colored output in development
 * - Levels: debug, info, warn, error
 * - Context propagation via child loggers
 *
 * Usage:
 *   import { logger } from '@/lib/logger';
 *   logger.info('user signed in', { userId, ip });
 *   const reqLog = logger.child({ requestId });
 *   reqLog.error('db query failed', { error });
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: '\x1b[36m', // cyan
  info: '\x1b[32m', // green
  warn: '\x1b[33m', // yellow
  error: '\x1b[31m', // red
};
const RESET = '\x1b[0m';
const DIM = '\x1b[2m';

const minLevel: LogLevel =
  (process.env.LOG_LEVEL as LogLevel | undefined) ??
  (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

const isProd = process.env.NODE_ENV === 'production';

type LogContext = Record<string, unknown>;

interface Logger {
  debug(msg: string, ctx?: LogContext): void;
  info(msg: string, ctx?: LogContext): void;
  warn(msg: string, ctx?: LogContext): void;
  error(msg: string, ctx?: LogContext): void;
  child(bindings: LogContext): Logger;
}

function createLogger(baseContext: LogContext = {}): Logger {
  function log(level: LogLevel, msg: string, ctx?: LogContext): void {
    if (LEVELS[level] < LEVELS[minLevel]) return;

    const merged = { ...baseContext, ...ctx };
    const time = new Date().toISOString();

    if (isProd) {
      const payload = {
        time,
        level,
        msg,
        ...merged,
      };
      console.log(JSON.stringify(payload));
      return;
    }

    const color = LEVEL_COLORS[level];
    const ctxStr = Object.keys(merged).length
      ? ` ${DIM}${JSON.stringify(merged)}${RESET}`
      : '';
    console.log(
      `${DIM}${time}${RESET} ${color}${level.toUpperCase().padEnd(5)}${RESET} ${msg}${ctxStr}`
    );
  }

  return {
    debug: (msg, ctx) => log('debug', msg, ctx),
    info: (msg, ctx) => log('info', msg, ctx),
    warn: (msg, ctx) => log('warn', msg, ctx),
    error: (msg, ctx) => log('error', msg, ctx),
    child: (bindings) => createLogger({ ...baseContext, ...bindings }),
  };
}

export const logger = createLogger();
export type { Logger, LogContext, LogLevel };
