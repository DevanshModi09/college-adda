import { db } from '../db/database.ts';

export interface NoticeRecord {
  id: string;
  sectionKey: string;
  authorId: string;
  body: string;
  pinned: boolean;
  createdAt: number;
}

interface Row {
  id: string;
  section_key: string;
  author_id: string;
  body: string;
  pinned: number;
  created_at: number;
}

const toRecord = (r: Row): NoticeRecord => ({
  id: r.id,
  sectionKey: r.section_key,
  authorId: r.author_id,
  body: r.body,
  pinned: r.pinned === 1,
  createdAt: r.created_at,
});

export const noticesRepo = {
  listBySection(sectionKey: string, limit = 100): NoticeRecord[] {
    const rows = db()
      .prepare('SELECT * FROM notices WHERE section_key = ? ORDER BY pinned DESC, created_at DESC LIMIT ?')
      .all(sectionKey, limit) as unknown as Row[];
    return rows.map(toRecord);
  },

  find(id: string): NoticeRecord | null {
    const row = db().prepare('SELECT * FROM notices WHERE id = ?').get(id) as Row | undefined;
    return row ? toRecord(row) : null;
  },

  insert(n: NoticeRecord): void {
    db()
      .prepare('INSERT INTO notices (id, section_key, author_id, body, pinned, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(n.id, n.sectionKey, n.authorId, n.body, n.pinned ? 1 : 0, n.createdAt);
  },

  setPinned(id: string, pinned: boolean): void {
    db().prepare('UPDATE notices SET pinned = ? WHERE id = ?').run(pinned ? 1 : 0, id);
  },

  delete(id: string): void {
    db().prepare('DELETE FROM notices WHERE id = ?').run(id);
  },
};
