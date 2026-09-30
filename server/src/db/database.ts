import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { env } from '../config/env.ts';
import { migrations } from './migrations.ts';

export type Db = DatabaseSync;

export function openDatabase(file: string = env.dbFile): Db {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  migrate(db);
  return db;
}

function migrate(db: Db) {
  const { user_version: current } = db.prepare('PRAGMA user_version').get() as { user_version: number };
  migrations.slice(current).forEach((sql, i) => {
    db.exec('BEGIN');
    try {
      db.exec(sql);
      db.exec(`PRAGMA user_version = ${current + i + 1}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  });
}

let instance: Db | null = null;
export const db = (): Db => (instance ??= openDatabase());
export const setDb = (next: Db) => void (instance = next);

export function transaction<T>(fn: () => T): T {
  db().exec('BEGIN');
  try {
    const out = fn();
    db().exec('COMMIT');
    return out;
  } catch (err) {
    db().exec('ROLLBACK');
    throw err;
  }
}
