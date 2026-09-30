import type { Request, Response } from 'express';
import { authService } from '../services/auth.service.ts';
import { usersService, toPublicUser } from '../services/users.service.ts';
import { clearSessionCookie, currentUser, SESSION_COOKIE, setSessionCookie } from '../middleware/auth.ts';
import { loginSchema, profileSchema, registerSchema } from '../validators/schemas.ts';

export const authController = {
  async register(req: Request, res: Response) {
    const session = await authService.register(registerSchema.parse(req.body));
    setSessionCookie(res, session);
    res.status(201).json({ user: session.user });
  },

  async login(req: Request, res: Response) {
    const session = await authService.login(loginSchema.parse(req.body));
    setSessionCookie(res, session);
    res.json({ user: session.user });
  },

  async guest(_req: Request, res: Response) {
    const session = await authService.guest();
    setSessionCookie(res, session);
    res.status(201).json({ user: session.user });
  },

  logout(req: Request, res: Response) {
    const token = req.cookies?.[SESSION_COOKIE];
    if (token) authService.logout(token);
    clearSessionCookie(res);
    res.status(204).end();
  },

  me(req: Request, res: Response) {
    res.json({ user: toPublicUser(currentUser(req)) });
  },

  updateMe(req: Request, res: Response) {
    res.json({ user: usersService.updateProfile(currentUser(req).id, profileSchema.parse(req.body)) });
  },
};
