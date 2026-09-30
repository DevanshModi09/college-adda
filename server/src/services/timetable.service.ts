import fs from 'node:fs';
import path from 'node:path';
import type { ClassKind, ClassSlot, FreeRooms, Section } from '@adda/shared';
import { timetableRepo } from '../repositories/timetable.repo.ts';
import type { UserRecord } from '../repositories/users.repo.ts';
import { transaction } from '../db/database.ts';
import { badRequest, forbidden, newId, notFound } from '../utils/http.ts';
import { logger } from '../utils/logger.ts';
import type { ClassCreate } from '../validators/schemas.ts';

export const CATALOG_DIR = path.resolve(import.meta.dirname, '../../catalog');

export const sectionKeyOf = (u: Pick<UserRecord, 'branch' | 'year' | 'section'>) => `${u.branch}|${u.year}|${u.section}`;

export function parseSectionKey(key: string): Pick<Section, 'key' | 'branch' | 'year' | 'section'> | null {
  const [branch, year, section, extra] = key.split('|');
  if (extra !== undefined || !branch || !year || !section || !/^[1-5]$/.test(year) || !/^[A-Z]{1,3}$/.test(section)) return null;
  return { key, branch, year: Number(year), section };
}

/** Natural order: CSE·2·A, B, … O, then DA…, SA… (letters by length, then alphabet). */
const sectionOrder = (a: Section, b: Section) =>
  a.branch.localeCompare(b.branch) || a.year - b.year || a.section.length - b.section.length || a.section.localeCompare(b.section);

const strip = ({ createdBy: _, ...slot }: ClassSlot & { createdBy: string | null }): ClassSlot => slot;

interface CatalogFile {
  branch: string;
  year: number;
  term: string;
  source: string;
  sections: { key: string; code: string; label: string; slots: { day: number; start: string; end: string; subject: string; kind: string; room: string; teacher: string }[] }[];
}

export const timetableService = {
  /** Anyone can read any section's timetable. Defaults to the viewer's own section. */
  async list(viewer: UserRecord, sectionKey?: string): Promise<ClassSlot[]> {
    const key = sectionKey || sectionKeyOf(viewer);
    if (!parseSectionKey(key)) throw badRequest('Unknown section');
    return (await timetableRepo.listBySection(key)).map(strip);
  },

  async sections(viewer?: UserRecord): Promise<Section[]> {
    const rows = await timetableRepo.sections();
    if (viewer?.branch && !rows.some((r) => r.key === sectionKeyOf(viewer))) {
      rows.push({ key: sectionKeyOf(viewer), label: '', members: 1, slots: 0 });
    }
    return rows
      .flatMap((r) => {
        const parsed = parseSectionKey(r.key);
        return parsed ? [{ ...parsed, label: r.label, members: r.members, slots: r.slots }] : [];
      })
      .sort(sectionOrder);
  },

  /** Rooms nobody is using at this moment, across every section's timetable. */
  async freeRooms(day: number, time: string): Promise<FreeRooms> {
    const [all, busyList, period] = await Promise.all([timetableRepo.allRooms(), timetableRepo.busyRooms(day, time), timetableRepo.periodAt(day, time)]);
    const busy = new Set(busyList);
    return { period, free: all.filter((r) => !busy.has(r)), busy: busy.size, total: all.length };
  },

  /** Students add extra slots to their own section; admins can add to any section. */
  async create(user: UserRecord, input: ClassCreate): Promise<ClassSlot> {
    const { section, ...fields } = input;
    const target = user.role === 'admin' && section ? section : sectionKeyOf(user);
    if (!user.branch) throw badRequest('Set your branch on your profile first');
    if (!parseSectionKey(target)) throw badRequest('Unknown section');
    const slot = { id: newId(), sectionKey: target, ...fields };
    await timetableRepo.insert(slot, user.id);
    return { ...slot, official: false };
  },

  /** Official (imported) slots: admins only. Student-added slots: that section's members or admins. */
  async remove(user: UserRecord, id: string): Promise<void> {
    const slot = await timetableRepo.find(id);
    if (!slot) throw notFound('Class');
    const isAdmin = user.role === 'admin';
    if (slot.official && !isAdmin) throw forbidden('The official timetable can only be changed by an admin');
    if (!slot.official && !isAdmin && slot.sectionKey !== sectionKeyOf(user)) {
      throw forbidden("You can only edit your own section's timetable");
    }
    await timetableRepo.delete(id);
  },

  /** Replaces the official slots of every section in the file (student-added slots are kept). */
  async importCatalog(file: string): Promise<{ sections: number; slots: number }> {
    const cat = JSON.parse(fs.readFileSync(file, 'utf8')) as CatalogFile;
    let slots = 0;
    await transaction(async () => {
      for (const s of cat.sections) {
        if (!parseSectionKey(s.key)) throw new Error(`bad section key ${s.key} in ${file}`);
        await timetableRepo.upsertSection({ key: s.key, branch: cat.branch, year: cat.year, code: s.code, label: s.label, term: cat.term, source: cat.source });
        await timetableRepo.deleteOfficial(s.key);
        // One statement per section: hundreds of single inserts would be slow over the network.
        await timetableRepo.insertMany(
          s.slots.map((slot) => ({
            id: newId(),
            sectionKey: s.key,
            day: slot.day,
            start: slot.start,
            end: slot.end,
            subject: slot.subject,
            kind: (['Lecture', 'Lab', 'Tutorial'].includes(slot.kind) ? slot.kind : 'Lecture') as ClassKind,
            room: slot.room,
            teacher: slot.teacher,
          }))
        );
        slots += s.slots.length;
      }
    }, 60_000); // three round trips per section: far past the default 5 s on a big catalog
    return { sections: cat.sections.length, slots };
  },

  /** On first boot, load every catalog file so a fresh deploy has real timetables. */
  async importCatalogIfEmpty(): Promise<void> {
    if ((await timetableRepo.catalogCount()) || !fs.existsSync(CATALOG_DIR)) return;
    for (const f of fs.readdirSync(CATALOG_DIR).filter((f) => f.endsWith('.json'))) {
      const r = await this.importCatalog(path.join(CATALOG_DIR, f));
      logger.info(`imported timetable catalog ${f}`, r);
    }
  },
};
