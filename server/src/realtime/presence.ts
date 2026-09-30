// In-memory presence: who is connected, and who is sitting in which room.
// Connection-agnostic so services can read it without touching sockets.

interface RoomSeat {
  status: string;
  joinedAt: number;
  connections: Set<string>;
}

const connections = new Map<string, Set<string>>(); // userId -> connectionIds
const rooms = new Map<string, Map<string, RoomSeat>>(); // roomId -> userId -> seat

export const presence = {
  /** Returns true when this is the user's first live connection. */
  connect(userId: string, connId: string): boolean {
    const set = connections.get(userId) ?? new Set();
    const first = set.size === 0;
    set.add(connId);
    connections.set(userId, set);
    return first;
  },

  /** Returns true when the user has no live connections left. */
  disconnect(userId: string, connId: string): boolean {
    const set = connections.get(userId);
    if (!set) return false;
    set.delete(connId);
    if (set.size) return false;
    connections.delete(userId);
    return true;
  },

  isOnline: (userId: string) => connections.has(userId),
  onlineIds: () => [...connections.keys()],

  joinRoom(roomId: string, userId: string, connId: string): void {
    const seats = rooms.get(roomId) ?? new Map<string, RoomSeat>();
    const seat = seats.get(userId) ?? { status: '', joinedAt: Date.now(), connections: new Set() };
    seat.connections.add(connId);
    seats.set(userId, seat);
    rooms.set(roomId, seats);
  },

  leaveRoom(roomId: string, userId: string, connId: string): void {
    const seats = rooms.get(roomId);
    const seat = seats?.get(userId);
    if (!seats || !seat) return;
    seat.connections.delete(connId);
    if (!seat.connections.size) seats.delete(userId);
    if (!seats.size) rooms.delete(roomId);
  },

  setStatus(roomId: string, userId: string, status: string): boolean {
    const seat = rooms.get(roomId)?.get(userId);
    if (!seat) return false;
    seat.status = status;
    return true;
  },

  seats(roomId: string): { userId: string; status: string; joinedAt: number }[] {
    return [...(rooms.get(roomId)?.entries() ?? [])].map(([userId, s]) => ({ userId, status: s.status, joinedAt: s.joinedAt }));
  },

  isEmpty: (roomId: string) => !rooms.get(roomId)?.size,

  /** Test helper. */
  reset(): void {
    connections.clear();
    rooms.clear();
  },
};
