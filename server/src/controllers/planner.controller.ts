import type { Request, Response } from 'express';
import { currentUser } from '../middleware/auth.ts';
import { deadlinesService } from '../services/deadlines.service.ts';
import { timetableService } from '../services/timetable.service.ts';
import { attendanceService } from '../services/attendance.service.ts';
import { assignmentsService } from '../services/assignments.service.ts';
import {
  assignmentUpdateSchema,
  attendanceAllSchema,
  attendanceBaselineSchema,
  attendanceDaySchema,
  attendanceMarkSchema,
  attendanceSettingsSchema,
  attendanceSetupSchema,
  attendanceTodaySchema,
  classCreateSchema,
  deadlineCreateSchema, deadlineUpdateSchema, freeRoomsQuerySchema, idParam, timetableQuerySchema } from '../validators/schemas.ts';

export const deadlinesController = {
  async list(req: Request, res: Response) {
    res.json(await deadlinesService.list(currentUser(req)));
  },
  async create(req: Request, res: Response) {
    res.status(201).json(await deadlinesService.create(currentUser(req), deadlineCreateSchema.parse(req.body)));
  },
  async update(req: Request, res: Response) {
    const { id } = idParam.parse(req.params);
    res.json(await deadlinesService.update(currentUser(req), id, deadlineUpdateSchema.parse(req.body)));
  },
  async remove(req: Request, res: Response) {
    await deadlinesService.remove(currentUser(req), idParam.parse(req.params).id);
    res.status(204).end();
  },
};

export const assignmentsController = {
  async list(req: Request, res: Response) {
    res.json(await assignmentsService.list(currentUser(req)));
  },
  async update(req: Request, res: Response) {
    res.json(await assignmentsService.update(currentUser(req), assignmentUpdateSchema.parse(req.body)));
  },
};

export const attendanceController = {
  async overview(req: Request, res: Response) {
    res.json(await attendanceService.overview(currentUser(req), attendanceTodaySchema.parse(req.query).today));
  },
  async day(req: Request, res: Response) {
    res.json(await attendanceService.day(currentUser(req), attendanceDaySchema.parse(req.query).date));
  },
  async mark(req: Request, res: Response) {
    const b = attendanceMarkSchema.parse(req.body);
    res.json(await attendanceService.mark(currentUser(req), b.date, b.today, b.slotId, b.status));
  },
  async markAll(req: Request, res: Response) {
    const b = attendanceAllSchema.parse(req.body);
    res.json(await attendanceService.markAllPresent(currentUser(req), b.date, b.today));
  },
  async baseline(req: Request, res: Response) {
    const b = attendanceBaselineSchema.parse(req.body);
    await attendanceService.setBaseline(currentUser(req), b.subject, b.attended, b.held);
    res.status(204).end();
  },
  async setup(req: Request, res: Response) {
    await attendanceService.setup(currentUser(req), attendanceSetupSchema.parse(req.body));
    res.status(204).end();
  },
  async settings(req: Request, res: Response) {
    const b = attendanceSettingsSchema.parse(req.body);
    await attendanceService.saveSettings(currentUser(req), b.target, b.semEnd);
    res.status(204).end();
  },
};

export const timetableController = {
  async list(req: Request, res: Response) {
    res.json(await timetableService.list(currentUser(req), timetableQuerySchema.parse(req.query).section));
  },
  async freeRooms(req: Request, res: Response) {
    const { day, time } = freeRoomsQuerySchema.parse(req.query);
    res.json(await timetableService.freeRooms(day, time));
  },
  /** Public (the sign-up form needs it); includes the viewer's own section when logged in. */
  async sections(req: Request, res: Response) {
    res.json(await timetableService.sections(req.user));
  },
  async create(req: Request, res: Response) {
    res.status(201).json(await timetableService.create(currentUser(req), classCreateSchema.parse(req.body)));
  },
  async remove(req: Request, res: Response) {
    await timetableService.remove(currentUser(req), idParam.parse(req.params).id);
    res.status(204).end();
  },
};
