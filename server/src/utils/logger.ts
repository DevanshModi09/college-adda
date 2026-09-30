import { env } from '../config/env.ts';

type Level = 'debug' | 'info' | 'warn' | 'error';

function write(level: Level, msg: string, meta?: Record<string, unknown>) {
  if (level === 'debug' && env.isProd) return;
  const err = meta?.err instanceof Error ? { err: { message: meta.err.message, stack: meta.err.stack } } : {};
  const line = env.isProd
    ? JSON.stringify({ t: new Date().toISOString(), level, msg, ...meta, ...err })
    : `${new Date().toLocaleTimeString()} ${level.toUpperCase().padEnd(5)} ${msg}${meta ? ' ' + JSON.stringify({ ...meta, ...err }) : ''}`;
  (level === 'error' ? console.error : console.log)(line);
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => write('debug', msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => write('info', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => write('warn', msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => write('error', msg, meta),
};
