import type { Priority } from '@adda/shared';
import { db } from '../db/database.ts';

export interface DeadlineRecord {
  id: string;
  kind: 'personal' | 'official';
  ownerId: string | null;
  audience: string; // '' = everyone, else a section key
  createdBy: string | null;
  title: string;
  subject: string;
  dueAt: number;
  priority: Priority;
  createdAt: number;
}

interface Row {
  id: string;
  kind: 'personal' | 'official';
  owner_id: string | null;
  audience: string;
  created_by: string | null;
  title: string;
  subject: string;
  due_at: number;
  priority: Priority;
  created_at: number;
  done: number;
}

const toRecord = (r: Row): DeadlineRecord & { done: boolean } => ({
  id: r.id,
  kind: r.kind,
  ownerId: r.owner_id,
  audience: r.audience,
  createdBy: r.created_by,
  title: r.title,
  subject: r.subject,
  dueAt: r.due_at,
  priority: r.priority,
  createdAt: r.created_at,
  done: r.done === 1,
});

const SELECT_WITH_DONE = `
  SELECT d.*, EXISTS (SELECT 1 FROM deadline_completions c WHERE c.deadline_id = d.id AND c.user_id = :viewer) AS done
  FROM deadlines d`;

export const deadlinesRepo = {
  /** Personal deadlines of the viewer + official ones addressed to everyone or the viewer's section. */
  visibleTo(viewerId: string, sectionKey: string) {
    const rows = db()
      .prepare(
        `${SELECT_WITH_DONE}
         WHERE (d.kind = 'personal' AND d.owner_id = :viewer)
            OR (d.kind = 'official' AND d.audience IN ('', :section))
         ORDER BY d.due_at`
      )
      .all({ viewer: viewerId, section: sectionKey }) as unknown as Row[];
    return rows.map(toRecord);
  },

  findFor(viewerId: string, id: string) {
    const row = db().prepare(`${SELECT_WITH_DONE} WHERE d.id = :id`).get({ viewer: viewerId, id }) as Row | undefined;
    return row ? toRecord(row) : null;
  },

  insert(d: DeadlineRecord): void {
    db()
      .prepare(
        `INSERT INTO deadlines (id, kind, owner_id, audience, created_by, title, subject, due_at, priority, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(d.id, d.kind, d.ownerId, d.audience, d.createdBy, d.title, d.subject, d.dueAt, d.priority, d.createdAt);
  },

  updateFields(d: Pick<DeadlineRecord, 'id' | 'title' | 'subject' | 'dueAt' | 'priority'>): void {
    db()
      .prepare('UPDATE deadlines SET title = ?, subject = ?, due_at = ?, priority = ? WHERE id = ?')
      .run(d.title, d.subject, d.dueAt, d.priority, d.id);
  },

  setDone(id: string, userId: string, done: boolean): void {
    if (done) {
      db().prepare('INSERT OR IGNORE INTO deadline_completions (deadline_id, user_id, done_at) VALUES (?, ?, ?)').run(id, userId, Date.now());
    } else {
      db().prepare('DELETE FROM deadline_completions WHERE deadline_id = ? AND user_id = ?').run(id, userId);
    }
  },

  delete(id: string): void {
    db().prepare('DELETE FROM deadlines WHERE id = ?').run(id);
  },
};
