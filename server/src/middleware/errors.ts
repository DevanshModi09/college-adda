import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import type { ApiError } from '@adda/shared';
import { HttpError } from '../utils/http.ts';
import { logger } from '../utils/logger.ts';

export function notFoundHandler(_req: Request, res: Response<ApiError>) {
  res.status(404).json({ error: 'Not found' });
}

export function errorHandler(err: unknown, req: Request, res: Response<ApiError>, _next: NextFunction) {
  if (err instanceof ZodError) {
    const details: Record<string, string> = {};
    for (const issue of err.issues) details[issue.path.join('.') || '_'] ??= issue.message;
    res.status(400).json({ error: err.issues[0]?.message ?? 'Invalid input', details });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, ...(err.details && { details: err.details }) });
    return;
  }
  // Malformed JSON bodies from express.json()
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ error: 'Malformed JSON' });
    return;
  }
  logger.error('unhandled error', { method: req.method, path: req.path, err });
  res.status(500).json({ error: 'Something went wrong' });
}
