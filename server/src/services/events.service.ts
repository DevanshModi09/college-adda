import type { CampusEvent } from '@adda/shared';
import { eventsRepo, type EventRecord } from '../repositories/events.repo.ts';
import type { UserRecord } from '../repositories/users.repo.ts';
import { transaction } from '../db/database.ts';
import { bus } from '../realtime/bus.ts';
import { forbidden, newId, notFound } from '../utils/http.ts';
import type { EventCreate } from '../validators/schemas.ts';
import { usersService } from './users.service.ts';

const GRACE_MS = 3 * 3600e3; // keep showing events for a few hours after they start

async function present(records: EventRecord[], viewerId: string): Promise<CampusEvent[]> {
  const attendees = await eventsRepo.attendeeIds(records.map((e) => e.id));
  const users = await usersService.publicByIds([...records.map((e) => e.createdBy), ...[...attendees.values()].flat()]);
  return records.map(({ createdBy, ...e }) => {
    const ids = attendees.get(e.id) ?? [];
    return {
      ...e,
      host: users.get(createdBy) ?? null,
      attendees: ids.flatMap((id) => users.get(id) ?? []),
      going: ids.includes(viewerId),
    };
  });
}

export const eventsService = {
  listUpcoming: async (viewerId: string) => present(await eventsRepo.listUpcoming(Date.now() - GRACE_MS), viewerId),

  /** Events are official: only admins post them. Everyone can RSVP. */
  async create(user: UserRecord, input: EventCreate): Promise<CampusEvent> {
    if (user.role !== 'admin') throw forbidden('Only admins can create events');
    const record: EventRecord = { id: newId(), ...input, createdBy: user.id, createdAt: Date.now() };
    await transaction(async () => {
      await eventsRepo.insert(record);
      await eventsRepo.addAttendee(record.id, user.id);
    });
    bus.emit('events:changed');
    return (await present([record], user.id))[0]!;
  },

  async toggleRsvp(userId: string, eventId: string): Promise<CampusEvent> {
    const record = await eventsRepo.find(eventId);
    if (!record) throw notFound('Event');
    if (await eventsRepo.isAttending(eventId, userId)) await eventsRepo.removeAttendee(eventId, userId);
    else await eventsRepo.addAttendee(eventId, userId);
    bus.emit('events:changed');
    return (await present([record], userId))[0]!;
  },

  async remove(user: UserRecord, eventId: string): Promise<void> {
    const record = await eventsRepo.find(eventId);
    if (!record) throw notFound('Event');
    if (record.createdBy !== user.id && user.role !== 'admin') throw forbidden('Only an admin can delete this event');
    await eventsRepo.delete(eventId);
    bus.emit('events:changed');
  },
};
