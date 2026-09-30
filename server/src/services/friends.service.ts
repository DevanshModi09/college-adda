import type { FriendStatus, FriendsOverview, Person, PublicUser } from '@adda/shared';
import { friendsRepo, type FriendshipRow } from '../repositories/friends.repo.ts';
import { bus } from '../realtime/bus.ts';
import { badRequest, notFound } from '../utils/http.ts';
import { usersService } from './users.service.ts';

function statusFrom(viewer: string, row: FriendshipRow | null): FriendStatus {
  if (!row) return 'none';
  if (row.status === 'accepted') return 'friends';
  return row.requester_id === viewer ? 'outgoing' : 'incoming';
}

export const friendsService = {
  status: (viewer: string, other: string) => statusFrom(viewer, friendsRepo.between(viewer, other)),

  areFriends: (a: string, b: string) => friendsRepo.between(a, b)?.status === 'accepted',

  /** Attach the viewer's friend status to a list of users (one query, not N). */
  withStatus(viewer: string, users: PublicUser[]): Person[] {
    const rows = new Map(
      friendsRepo.forUser(viewer).map((r) => [r.requester_id === viewer ? r.addressee_id : r.requester_id, r] as const)
    );
    return users.map((u) => ({ ...u, friend: statusFrom(viewer, rows.get(u.id) ?? null) }));
  },

  overview(viewer: string): FriendsOverview {
    const rows = friendsRepo.forUser(viewer);
    const other = (r: FriendshipRow) => (r.requester_id === viewer ? r.addressee_id : r.requester_id);
    const users = usersService.publicByIds(rows.map(other));
    const pick = (keep: (r: FriendshipRow) => boolean) => rows.filter(keep).flatMap((r) => users.get(other(r)) ?? []);
    return {
      friends: pick((r) => r.status === 'accepted').sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name)),
      incoming: pick((r) => r.status === 'pending' && r.addressee_id === viewer),
      outgoing: pick((r) => r.status === 'pending' && r.requester_id === viewer),
    };
  },

  /** Send a request. If they already asked you, this accepts instead. */
  request(viewer: string, other: string): FriendStatus {
    if (viewer === other) throw badRequest("You can't friend yourself");
    usersService.get(other); // 404 for unknown users
    const status = this.status(viewer, other);
    if (status === 'friends' || status === 'outgoing') return status;
    if (status === 'incoming') return this.accept(viewer, other);
    friendsRepo.request(viewer, other);
    bus.emit('friends:changed', { to: other, kind: 'request', from: usersService.get(viewer) });
    return 'outgoing';
  },

  accept(viewer: string, other: string): FriendStatus {
    if (this.status(viewer, other) !== 'incoming') throw notFound('Friend request');
    friendsRepo.accept(other, viewer);
    bus.emit('friends:changed', { to: other, kind: 'accepted', from: usersService.get(viewer) });
    return 'friends';
  },

  /** Decline an incoming request, cancel an outgoing one, or unfriend. */
  remove(viewer: string, other: string): void {
    if (!friendsRepo.remove(viewer, other)) throw notFound('Friendship');
    bus.emit('friends:changed', { to: other, kind: 'removed', from: usersService.get(viewer) });
  },
};
