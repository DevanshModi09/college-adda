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
  status: async (viewer: string, other: string) => statusFrom(viewer, await friendsRepo.between(viewer, other)),

  areFriends: async (a: string, b: string) => (await friendsRepo.between(a, b))?.status === 'accepted',

  /** Attach the viewer's friend status to a list of users (one query, not N). */
  async withStatus(viewer: string, users: PublicUser[]): Promise<Person[]> {
    const rows = new Map(
      (await friendsRepo.forUser(viewer)).map((r) => [r.requester_id === viewer ? r.addressee_id : r.requester_id, r] as const)
    );
    return users.map((u) => ({ ...u, friend: statusFrom(viewer, rows.get(u.id) ?? null) }));
  },

  async overview(viewer: string): Promise<FriendsOverview> {
    const rows = await friendsRepo.forUser(viewer);
    const other = (r: FriendshipRow) => (r.requester_id === viewer ? r.addressee_id : r.requester_id);
    const users = await usersService.publicByIds(rows.map(other));
    const pick = (keep: (r: FriendshipRow) => boolean) => rows.filter(keep).flatMap((r) => users.get(other(r)) ?? []);
    return {
      friends: pick((r) => r.status === 'accepted').sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name)),
      incoming: pick((r) => r.status === 'pending' && r.addressee_id === viewer),
      outgoing: pick((r) => r.status === 'pending' && r.requester_id === viewer),
    };
  },

  /** Send a request. If they already asked you, this accepts instead. */
  async request(viewer: string, other: string): Promise<FriendStatus> {
    if (viewer === other) throw badRequest("You can't friend yourself");
    await usersService.get(other); // 404 for unknown users
    const status = await this.status(viewer, other);
    if (status === 'friends' || status === 'outgoing') return status;
    if (status === 'incoming') return this.accept(viewer, other);
    await friendsRepo.request(viewer, other);
    bus.emit('friends:changed', { to: other, kind: 'request', from: await usersService.get(viewer) });
    return 'outgoing';
  },

  async accept(viewer: string, other: string): Promise<FriendStatus> {
    if ((await this.status(viewer, other)) !== 'incoming') throw notFound('Friend request');
    await friendsRepo.accept(other, viewer);
    bus.emit('friends:changed', { to: other, kind: 'accepted', from: await usersService.get(viewer) });
    return 'friends';
  },

  /** Decline an incoming request, cancel an outgoing one, or unfriend. */
  async remove(viewer: string, other: string): Promise<void> {
    if (!(await friendsRepo.remove(viewer, other))) throw notFound('Friendship');
    bus.emit('friends:changed', { to: other, kind: 'removed', from: await usersService.get(viewer) });
  },
};
