import type { Request, Response } from 'express';
import { currentUser } from '../middleware/auth.ts';
import { usersService } from '../services/users.service.ts';
import { friendsService } from '../services/friends.service.ts';
import { messagesService } from '../services/messages.service.ts';
import { roomsService } from '../services/rooms.service.ts';
import { eventsService } from '../services/events.service.ts';
import { noticesService } from '../services/notices.service.ts';
import { feedService } from '../services/feed.service.ts';
import { lostFoundService } from '../services/lostfound.service.ts';
import {
  dmQuerySchema,
  dmSendSchema,
  eventCreateSchema,
  feedQuerySchema,
  postCreateSchema,
  idParam,
  noticeCreateSchema,
  noticePinSchema,
  pinCreateSchema,
  pinResolveSchema,
  peopleQuerySchema,
  roomCreateSchema,
  timetableQuerySchema,
} from '../validators/schemas.ts';

export const peopleController = {
  async search(req: Request, res: Response) {
    const me = currentUser(req).id;
    res.json(await friendsService.withStatus(me, await usersService.search(me, peopleQuerySchema.parse(req.query))));
  },
  async get(req: Request, res: Response) {
    const me = currentUser(req).id;
    res.json((await friendsService.withStatus(me, [await usersService.get(idParam.parse(req.params).id)]))[0]);
  },
};

export const friendsController = {
  async overview(req: Request, res: Response) {
    res.json(await friendsService.overview(currentUser(req).id));
  },
  async request(req: Request, res: Response) {
    res.json({ friend: await friendsService.request(currentUser(req).id, idParam.parse(req.params).id) });
  },
  async accept(req: Request, res: Response) {
    res.json({ friend: await friendsService.accept(currentUser(req).id, idParam.parse(req.params).id) });
  },
  async remove(req: Request, res: Response) {
    await friendsService.remove(currentUser(req).id, idParam.parse(req.params).id);
    res.status(204).end();
  },
};

export const messagesController = {
  async conversations(req: Request, res: Response) {
    res.json(await messagesService.conversations(currentUser(req).id));
  },
  async thread(req: Request, res: Response) {
    const { id } = idParam.parse(req.params);
    res.json(await messagesService.thread(currentUser(req).id, id, dmQuerySchema.parse(req.query)));
  },
  async send(req: Request, res: Response) {
    const { id } = idParam.parse(req.params);
    res.status(201).json(await messagesService.send(currentUser(req).id, id, dmSendSchema.parse(req.body).text));
  },
  async markRead(req: Request, res: Response) {
    await messagesService.markRead(currentUser(req).id, idParam.parse(req.params).id);
    res.status(204).end();
  },
};

export const roomsController = {
  async list(_req: Request, res: Response) {
    res.json(await roomsService.listWithMembers());
  },
  async create(req: Request, res: Response) {
    res.status(201).json(await roomsService.create(currentUser(req).id, roomCreateSchema.parse(req.body)));
  },
  async remove(req: Request, res: Response) {
    await roomsService.remove(currentUser(req).id, idParam.parse(req.params).id);
    res.status(204).end();
  },
};

export const eventsController = {
  async list(req: Request, res: Response) {
    res.json(await eventsService.listUpcoming(currentUser(req).id));
  },
  async create(req: Request, res: Response) {
    res.status(201).json(await eventsService.create(currentUser(req), eventCreateSchema.parse(req.body)));
  },
  async rsvp(req: Request, res: Response) {
    res.json(await eventsService.toggleRsvp(currentUser(req).id, idParam.parse(req.params).id));
  },
  async remove(req: Request, res: Response) {
    await eventsService.remove(currentUser(req), idParam.parse(req.params).id);
    res.status(204).end();
  },
};

export const noticesController = {
  async list(req: Request, res: Response) {
    res.json(await noticesService.list(currentUser(req), timetableQuerySchema.parse(req.query).section));
  },
  async create(req: Request, res: Response) {
    res.status(201).json(await noticesService.create(currentUser(req), noticeCreateSchema.parse(req.body)));
  },
  async pin(req: Request, res: Response) {
    res.json(await noticesService.setPinned(currentUser(req), idParam.parse(req.params).id, noticePinSchema.parse(req.body).pinned));
  },
  async remove(req: Request, res: Response) {
    await noticesService.remove(currentUser(req), idParam.parse(req.params).id);
    res.status(204).end();
  },
};

export const feedController = {
  async list(req: Request, res: Response) {
    res.json(await feedService.list(currentUser(req), feedQuerySchema.parse(req.query)));
  },
  async create(req: Request, res: Response) {
    res.status(201).json(await feedService.create(currentUser(req), postCreateSchema.parse(req.body)));
  },
  async like(req: Request, res: Response) {
    res.json(await feedService.toggleLike(currentUser(req), idParam.parse(req.params).id));
  },
  async image(req: Request, res: Response) {
    const img = await feedService.image(idParam.parse(req.params).id);
    // Posts never change their photo, so browsers can keep it.
    res.set({ 'Content-Type': img.mime, 'Cache-Control': 'private, max-age=86400, immutable' }).send(Buffer.from(img.data));
  },
  async remove(req: Request, res: Response) {
    await feedService.remove(currentUser(req), idParam.parse(req.params).id);
    res.status(204).end();
  },
};

export const lostFoundController = {
  async list(req: Request, res: Response) {
    res.json(await lostFoundService.list(currentUser(req)));
  },
  async create(req: Request, res: Response) {
    res.status(201).json(await lostFoundService.create(currentUser(req), pinCreateSchema.parse(req.body)));
  },
  async resolve(req: Request, res: Response) {
    res.json(await lostFoundService.setResolved(currentUser(req), idParam.parse(req.params).id, pinResolveSchema.parse(req.body).resolved));
  },
  async remove(req: Request, res: Response) {
    await lostFoundService.remove(currentUser(req), idParam.parse(req.params).id);
    res.status(204).end();
  },
};
