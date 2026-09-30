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
  list(req: Request, res: Response) {
    res.json(deadlinesService.list(currentUser(req)));
  },
  create(req: Request, res: Response) {
    res.status(201).json(deadlinesService.create(currentUser(req), deadlineCreateSchema.parse(req.body)));
  },
  update(req: Request, res: Response) {
    const { id } = idParam.parse(req.params);
    res.json(deadlinesService.update(currentUser(req), id, deadlineUpdateSchema.parse(req.body)));
  },
  remove(req: Request, res: Response) {
    deadlinesService.remove(currentUser(req), idParam.parse(req.params).id);
    res.status(204).end();
  },
};

export const assignmentsController = {
  list(req: Request, res: Response) {
    res.json(assignmentsService.list(currentUser(req)));
  },
  update(req: Request, res: Response) {
    res.json(assignmentsService.update(currentUser(req), assignmentUpdateSchema.parse(req.body)));
  },
};

export const attendanceController = {
  overview(req: Request, res: Response) {
    res.json(attendanceService.overview(currentUser(req), attendanceTodaySchema.parse(req.query).today));
  },
  day(req: Request, res: Response) {
    res.json(attendanceService.day(currentUser(req), attendanceDaySchema.parse(req.query).date));
  },
  mark(req: Request, res: Response) {
    const b = attendanceMarkSchema.parse(req.body);
    res.json(attendanceService.mark(currentUser(req), b.date, b.today, b.slotId, b.status));
  },
  markAll(req: Request, res: Response) {
    const b = attendanceAllSchema.parse(req.body);
    res.json(attendanceService.markAllPresent(currentUser(req), b.date, b.today));
  },
  baseline(req: Request, res: Response) {
    const b = attendanceBaselineSchema.parse(req.body);
    attendanceService.setBaseline(currentUser(req), b.subject, b.attended, b.held);
    res.status(204).end();
  },
  setup(req: Request, res: Response) {
    attendanceService.setup(currentUser(req), attendanceSetupSchema.parse(req.body));
    res.status(204).end();
  },
  settings(req: Request, res: Response) {
    const b = attendanceSettingsSchema.parse(req.body);
    attendanceService.saveSettings(currentUser(req), b.target, b.semEnd);
    res.status(204).end();
  },
};

export const timetableController = {
  list(req: Request, res: Response) {
    res.json(timetableService.list(currentUser(req), timetableQuerySchema.parse(req.query).section));
  },
  freeRooms(req: Request, res: Response) {
    const { day, time } = freeRoomsQuerySchema.parse(req.query);
    res.json(timetableService.freeRooms(day, time));
  },
  /** Public (the sign-up form needs it); includes the viewer's own section when logged in. */
  sections(req: Request, res: Response) {
    res.json(timetableService.sections(req.user));
  },
  create(req: Request, res: Response) {
    res.status(201).json(timetableService.create(currentUser(req), classCreateSchema.parse(req.body)));
  },
  remove(req: Request, res: Response) {
    timetableService.remove(currentUser(req), idParam.parse(req.params).id);
    res.status(204).end();
  },
};
