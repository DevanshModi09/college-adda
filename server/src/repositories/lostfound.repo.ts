import { db } from '../db/database.ts';
import { ms } from '../db/convert.ts';

export interface PinRecord {
  id: string;
  userId: string;
  kind: 'lost' | 'found';
  title: string;
  details: string;
  x: number;
  y: number;
  place: string;
  resolved: boolean;
  createdAt: number;
}

type Row = Omit<PinRecord, 'kind' | 'createdAt'> & { kind: string; createdAt: bigint };

const toRecord = (r: Row): PinRecord => ({ ...r, kind: r.kind === 'found' ? 'found' : 'lost', createdAt: ms(r.createdAt) });

export const lostFoundRepo = {
  /** Open pins, plus resolved ones pinned since `since` (so people see things got back to their owners). */
  async list(since: number): Promise<PinRecord[]> {
    const rows = await db().lostFound.findMany({
      where: { OR: [{ resolved: false }, { createdAt: { gte: since } }] },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map(toRecord);
  },

  async find(id: string): Promise<PinRecord | null> {
    const row = await db().lostFound.findUnique({ where: { id } });
    return row ? toRecord(row) : null;
  },

  async openCount(userId: string): Promise<number> {
    return db().lostFound.count({ where: { userId, resolved: false } });
  },

  async insert(p: PinRecord): Promise<void> {
    const { id, userId, kind, title, details, x, y, place, resolved, createdAt } = p;
    await db().lostFound.create({ data: { id, userId, kind, title, details, x, y, place, resolved, createdAt } });
  },

  async setResolved(id: string, resolved: boolean): Promise<void> {
    await db().lostFound.update({ where: { id }, data: { resolved } });
  },

  async delete(id: string): Promise<void> {
    await db().lostFound.delete({ where: { id } });
  },
};
