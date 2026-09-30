import type { NextFunction, Request, Response } from 'express';
import type { UserRecord } from '../repositories/users.repo.ts';
import { authService, type Session } from '../services/auth.service.ts';
import { unauthorized } from '../utils/http.ts';

export const SESSION_COOKIE = 'adda_sid';

declare module 'express-serve-static-core' {
  interface Request {
    user?: UserRecord;
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const user = authService.userFromToken(req.cookies?.[SESSION_COOKIE]);
  if (!user) throw unauthorized();
  req.user = user;
  next();
}

/** Attaches the user when a valid session cookie is present; never rejects. */
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  req.user = authService.userFromToken(req.cookies?.[SESSION_COOKIE]) ?? undefined;
  next();
}

/** The authenticated user; only valid behind requireAuth. */
export function currentUser(req: Request): UserRecord {
  if (!req.user) throw unauthorized();
  return req.user;
}

export function setSessionCookie(res: Response, session: Session) {
  res.cookie(SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: 'lax',
    // Secure whenever the request arrived over HTTPS (Render, behind its proxy); plain-HTTP
    // LAN testing (phones hitting http://<laptop-ip>) still gets a working cookie.
    secure: res.req.secure,
    expires: new Date(session.expiresAt),
    path: '/',
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}
