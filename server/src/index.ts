import http from 'node:http';
import { env } from './config/env.ts';
import { disconnect } from './db/database.ts';
import { createApp } from './app.ts';
import { attachRealtime } from './realtime/hub.ts';
import { roomsService } from './services/rooms.service.ts';
import { sessionsRepo } from './repositories/sessions.repo.ts';
import { usersRepo } from './repositories/users.repo.ts';
import { authService } from './services/auth.service.ts';
import { timetableService } from './services/timetable.service.ts';
import { logger } from './utils/logger.ts';

// Schema changes are applied separately (`npm run db:migrate`) before the app starts.
await roomsService.seedDefaults();
await timetableService.importCatalogIfEmpty();
await sessionsRepo.deleteExpired();
const staleGuests = await authService.deleteStaleGuests();
if (staleGuests) logger.info(`removed ${staleGuests} expired guest account(s)`);
const promoted = await usersRepo.promoteAdmins(env.adminUsernames);
if (promoted) logger.info(`promoted ${promoted} user(s) to admin`);

const server = http.createServer(createApp());
const wss = attachRealtime(server);

server.listen(env.port, () => logger.info(`College Adda API listening on http://localhost:${env.port}`, { env: env.nodeEnv }));

function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  wss.clients.forEach((ws) => ws.close(1001, 'server restarting'));
  wss.close();
  server.close(() => {
    void disconnect().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
