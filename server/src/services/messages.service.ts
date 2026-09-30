import type { Conversation, DirectMessage } from '@adda/shared';
import { messagesRepo } from '../repositories/messages.repo.ts';
import { bus } from '../realtime/bus.ts';
import { badRequest, forbidden, newId } from '../utils/http.ts';
import { friendsService } from './friends.service.ts';
import { usersService } from './users.service.ts';

export const messagesService = {
  async conversations(userId: string): Promise<Conversation[]> {
    const convos = await messagesRepo.conversations(userId);
    const users = await usersService.publicByIds(convos.map((c) => c.partnerId));
    return convos.flatMap((c) => {
      const user = users.get(c.partnerId);
      return user ? [{ user, last: c.last, unread: c.unread }] : [];
    });
  },

  async thread(userId: string, otherId: string, opts: { before?: number; limit: number }): Promise<DirectMessage[]> {
    await usersService.get(otherId); // 404 for unknown users
    return messagesRepo.thread(userId, otherId, opts.before ?? Number.MAX_SAFE_INTEGER, opts.limit);
  },

  async send(senderId: string, recipientId: string, text: string): Promise<DirectMessage> {
    if (senderId === recipientId) throw badRequest("You can't message yourself");
    await usersService.get(recipientId);
    if (!(await friendsService.areFriends(senderId, recipientId))) throw forbidden('Add them as a friend to send messages');
    const message: DirectMessage = { id: newId(), senderId, recipientId, text, createdAt: Date.now(), readAt: null };
    await messagesRepo.insert(message);
    bus.emit('dm:created', { message, from: await usersService.get(senderId) });
    return message;
  },

  markRead: (userId: string, otherId: string) => messagesRepo.markRead(userId, otherId),
};
