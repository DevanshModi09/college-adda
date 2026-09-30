// Re-imports official timetables from server/catalog/*.json (or the given files).
// Official slots of those sections are replaced; slots students added are kept.
//   npm run import:timetable -w @adda/server [-- path/to/catalog.json]
import fs from 'node:fs';
import path from 'node:path';
import { disconnect } from '../src/db/database.ts';
import { CATALOG_DIR, timetableService } from '../src/services/timetable.service.ts';

const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : fs.readdirSync(CATALOG_DIR).filter((f) => f.endsWith('.json')).map((f) => path.join(CATALOG_DIR, f));

for (const file of files) {
  const { sections, slots } = await timetableService.importCatalog(file);
  console.log(`${path.basename(file)}: ${sections} sections, ${slots} slots`);
}
await disconnect();
