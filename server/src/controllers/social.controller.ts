import type { Request, Response } from 'express';
import { currentUser } from '../middleware/auth.ts';
import { usersService } from '../services/users.service.ts';
import { friendsService } from '../services/friends.service.ts';
import { messagesService } from '../services/messages.service.ts';
import { roomsService } from '../services/rooms.service.ts';
import { eventsService } from '../services/events.service.ts';
import { noticesService } from '../services/notices.service.ts';
import { feedService } from '../services/feed.service.ts';
import {
  dmQuerySchema,
  dmSendSchema,
  eventCreateSchema,
  feedQuerySchema,
  postCreateSchema,
  idParam,
  noticeCreateSchema,
  noticePinSchema,
  peopleQuerySchema,
  roomCreateSchema,
  timetableQuerySchema,
} from '../validators/schemas.ts';

export const peopleController = {
  search(req: Request, res: Response) {
    const me = currentUser(req).id;
    res.json(friendsService.withStatus(me, usersService.search(me, peopleQuerySchema.parse(req.query))));
  },
  get(req: Request, res: Response) {
    const me = currentUser(req).id;
    res.json(friendsService.withStatus(me, [usersService.get(idParam.parse(req.params).id)])[0]);
  },
};

export const friendsController = {
  overview(req: Request, res: Response) {
    res.json(friendsService.overview(currentUser(req).id));
  },
  request(req: Request, res: Response) {
    res.json({ friend: friendsService.request(currentUser(req).id, idParam.parse(req.params).id) });
  },
  accept(req: Request, res: Response) {
    res.json({ friend: friendsService.accept(currentUser(req).id, idParam.parse(req.params).id) });
  },
  remove(req: Request, res: Response) {
    friendsService.remove(currentUser(req).id, idParam.parse(req.params).id);
    res.status(204).end();
  },
};

export const messagesController = {
  conversations(req: Request, res: Response) {
    res.json(messagesService.conversations(currentUser(req).id));
  },
  thread(req: Request, res: Response) {
    const { id } = idParam.parse(req.params);
    res.json(messagesService.thread(currentUser(req).id, id, dmQuerySchema.parse(req.query)));
  },
  send(req: Request, res: Response) {
    const { id } = idParam.parse(req.params);
    res.status(201).json(messagesService.send(currentUser(req).id, id, dmSendSchema.parse(req.body).text));
  },
  markRead(req: Request, res: Response) {
    messagesService.markRead(currentUser(req).id, idParam.parse(req.params).id);
    res.status(204).end();
  },
};

export const roomsController = {
  list(_req: Request, res: Response) {
    res.json(roomsService.listWithMembers());
  },
  create(req: Request, res: Response) {
    res.status(201).json(roomsService.create(currentUser(req).id, roomCreateSchema.parse(req.body)));
  },
  remove(req: Request, res: Response) {
    roomsService.remove(currentUser(req).id, idParam.parse(req.params).id);
    res.status(204).end();
  },
};

export const eventsController = {
  list(req: Request, res: Response) {
    res.json(eventsService.listUpcoming(currentUser(req).id));
  },
  create(req: Request, res: Response) {
    res.status(201).json(eventsService.create(currentUser(req), eventCreateSchema.parse(req.body)));
  },
  rsvp(req: Request, res: Response) {
    res.json(eventsService.toggleRsvp(currentUser(req).id, idParam.parse(req.params).id));
  },
  remove(req: Request, res: Response) {
    eventsService.remove(currentUser(req), idParam.parse(req.params).id);
    res.status(204).end();
  },
};

export const noticesController = {
  list(req: Request, res: Response) {
    res.json(noticesService.list(currentUser(req), timetableQuerySchema.parse(req.query).section));
  },
  create(req: Request, res: Response) {
    res.status(201).json(noticesService.create(currentUser(req), noticeCreateSchema.parse(req.body)));
  },
  pin(req: Request, res: Response) {
    res.json(noticesService.setPinned(currentUser(req), idParam.parse(req.params).id, noticePinSchema.parse(req.body).pinned));
  },
  remove(req: Request, res: Response) {
    noticesService.remove(currentUser(req), idParam.parse(req.params).id);
    res.status(204).end();
  },
};

export const feedController = {
  list(req: Request, res: Response) {
    res.json(feedService.list(currentUser(req), feedQuerySchema.parse(req.query)));
  },
  async create(req: Request, res: Response) {
    res.status(201).json(await feedService.create(currentUser(req), postCreateSchema.parse(req.body)));
  },
  like(req: Request, res: Response) {
    res.json(feedService.toggleLike(currentUser(req), idParam.parse(req.params).id));
  },
  image(req: Request, res: Response) {
    const img = feedService.image(idParam.parse(req.params).id);
    // Posts never change their photo, so browsers can keep it.
    res.set({ 'Content-Type': img.mime, 'Cache-Control': 'private, max-age=86400, immutable' }).send(Buffer.from(img.data));
  },
  remove(req: Request, res: Response) {
    feedService.remove(currentUser(req), idParam.parse(req.params).id);
    res.status(204).end();
  },
};
