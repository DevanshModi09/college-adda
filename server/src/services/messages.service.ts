import type { Conversation, DirectMessage } from '@adda/shared';
import { messagesRepo } from '../repositories/messages.repo.ts';
import { bus } from '../realtime/bus.ts';
import { badRequest, forbidden, newId } from '../utils/http.ts';
import { friendsService } from './friends.service.ts';
import { usersService } from './users.service.ts';

export const messagesService = {
  conversations(userId: string): Conversation[] {
    const convos = messagesRepo.conversations(userId);
    const users = usersService.publicByIds(convos.map((c) => c.partnerId));
    return convos.flatMap((c) => {
      const user = users.get(c.partnerId);
      return user ? [{ user, last: c.last, unread: c.unread }] : [];
    });
  },

  thread(userId: string, otherId: string, opts: { before?: number; limit: number }): DirectMessage[] {
    usersService.get(otherId); // 404 for unknown users
    return messagesRepo.thread(userId, otherId, opts.before ?? Number.MAX_SAFE_INTEGER, opts.limit);
  },

  send(senderId: string, recipientId: string, text: string): DirectMessage {
    if (senderId === recipientId) throw badRequest("You can't message yourself");
    usersService.get(recipientId);
    if (!friendsService.areFriends(senderId, recipientId)) throw forbidden('Add them as a friend to send messages');
    const message: DirectMessage = { id: newId(), senderId, recipientId, text, createdAt: Date.now(), readAt: null };
    messagesRepo.insert(message);
    bus.emit('dm:created', { message, from: usersService.get(senderId) });
    return message;
  },

  markRead: (userId: string, otherId: string) => messagesRepo.markRead(userId, otherId),
};
