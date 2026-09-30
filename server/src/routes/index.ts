import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { env } from '../config/env.ts';
import { optionalAuth, requireAuth } from '../middleware/auth.ts';
import { authController } from '../controllers/auth.controller.ts';
import { assignmentsController, attendanceController, deadlinesController, timetableController } from '../controllers/planner.controller.ts';
import { eventsController, feedController, friendsController, messagesController, peopleController, roomsController } from '../controllers/social.controller.ts';

const limiter = (windowMs: number, limit: number) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: () => env.nodeEnv === 'test', // the test suite registers dozens of users from one IP
    message: { error: 'Too many attempts, try again in a few minutes' },
  });

const authLimiter = limiter(15 * 60e3, 30);
const postLimiter = limiter(10 * 60e3, 20); // posting to the feed
// Each guest login creates an account, so cap them per IP separately.
const guestLimiter = limiter(60 * 60e3, 20);

export function apiRouter(): Router {
  const api = Router();

  api.get('/health', (_req, res) => void res.json({ ok: true }));

  // Public
  api.get('/sections', optionalAuth, timetableController.sections);
  api.post('/auth/register', authLimiter, authController.register);
  api.post('/auth/login', authLimiter, authController.login);
  api.post('/auth/guest', guestLimiter, authController.guest);
  api.post('/auth/logout', authController.logout);

  // Everything below needs a session
  api.use(requireAuth);

  api.get('/me', authController.me);
  api.patch('/me', authController.updateMe);

  api.get('/deadlines', deadlinesController.list);
  api.post('/deadlines', deadlinesController.create);
  api.patch('/deadlines/:id', deadlinesController.update);
  api.delete('/deadlines/:id', deadlinesController.remove);

  api.get('/timetable', timetableController.list);
  api.get('/timetable/free-rooms', timetableController.freeRooms);
  api.post('/timetable', timetableController.create);
  api.delete('/timetable/:id', timetableController.remove);

  api.get('/feed', feedController.list);
  api.post('/feed', postLimiter, feedController.create);
  api.post('/feed/:id/like', feedController.like);
  api.get('/feed/:id/image', feedController.image);
  api.delete('/feed/:id', feedController.remove);



  api.get('/assignments', assignmentsController.list);
  api.put('/assignments', assignmentsController.update);

  api.get('/attendance', attendanceController.overview);
  api.get('/attendance/day', attendanceController.day);
  api.put('/attendance/mark', attendanceController.mark);
  api.post('/attendance/all-present', attendanceController.markAll);
  api.put('/attendance/baseline', attendanceController.baseline);
  api.put('/attendance/settings', attendanceController.settings);
  api.put('/attendance/setup', attendanceController.setup);

  api.get('/people', peopleController.search);
  api.get('/people/:id', peopleController.get);

  api.get('/friends', friendsController.overview);
  api.post('/friends/:id', friendsController.request);
  api.post('/friends/:id/accept', friendsController.accept);
  api.delete('/friends/:id', friendsController.remove);

  api.get('/conversations', messagesController.conversations);
  api.get('/conversations/:id/messages', messagesController.thread);
  api.post('/conversations/:id/messages', messagesController.send);
  api.post('/conversations/:id/read', messagesController.markRead);

  api.get('/rooms', roomsController.list);
  api.post('/rooms', roomsController.create);
  api.delete('/rooms/:id', roomsController.remove);

  api.get('/events', eventsController.list);
  api.post('/events', eventsController.create);
  api.post('/events/:id/rsvp', eventsController.rsvp);
  api.delete('/events/:id', eventsController.remove);

  return api;
}
