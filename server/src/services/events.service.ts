import type { CampusEvent } from '@adda/shared';
import { eventsRepo, type EventRecord } from '../repositories/events.repo.ts';
import type { UserRecord } from '../repositories/users.repo.ts';
import { transaction } from '../db/database.ts';
import { bus } from '../realtime/bus.ts';
import { forbidden, newId, notFound } from '../utils/http.ts';
import type { EventCreate } from '../validators/schemas.ts';
import { usersService } from './users.service.ts';

const GRACE_MS = 3 * 3600e3; // keep showing events for a few hours after they start

function present(records: EventRecord[], viewerId: string): CampusEvent[] {
  const attendees = eventsRepo.attendeeIds(records.map((e) => e.id));
  const users = usersService.publicByIds([...records.map((e) => e.createdBy), ...[...attendees.values()].flat()]);
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
  listUpcoming: (viewerId: string) => present(eventsRepo.listUpcoming(Date.now() - GRACE_MS), viewerId),

  /** Events are official: only admins post them. Everyone can RSVP. */
  create(user: UserRecord, input: EventCreate): CampusEvent {
    if (user.role !== 'admin') throw forbidden('Only admins can create events');
    const record: EventRecord = { id: newId(), ...input, createdBy: user.id, createdAt: Date.now() };
    transaction(() => {
      eventsRepo.insert(record);
      eventsRepo.addAttendee(record.id, user.id);
    });
    bus.emit('events:changed');
    return present([record], user.id)[0]!;
  },

  toggleRsvp(userId: string, eventId: string): CampusEvent {
    const record = eventsRepo.find(eventId);
    if (!record) throw notFound('Event');
    if (eventsRepo.isAttending(eventId, userId)) eventsRepo.removeAttendee(eventId, userId);
    else eventsRepo.addAttendee(eventId, userId);
    bus.emit('events:changed');
    return present([record], userId)[0]!;
  },

  remove(user: UserRecord, eventId: string): void {
    const record = eventsRepo.find(eventId);
    if (!record) throw notFound('Event');
    if (record.createdBy !== user.id && user.role !== 'admin') throw forbidden('Only an admin can delete this event');
    eventsRepo.delete(eventId);
    bus.emit('events:changed');
  },
};
