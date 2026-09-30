import { EventEmitter } from 'node:events';
import type { DirectMessage, PublicUser } from '@adda/shared';

// Domain events raised by services; the websocket hub turns them into pushes.
interface BusEvents {
  'dm:created': [{ message: DirectMessage; from: PublicUser }];
  'events:changed': [];
  'deadlines:changed': [];
  'feed:changed': [];
  'rooms:changed': [];
  'friends:changed': [{ to: string; kind: 'request' | 'accepted' | 'removed'; from: PublicUser }];
}

class TypedBus extends EventEmitter<BusEvents> {}

export const bus = new TypedBus();
