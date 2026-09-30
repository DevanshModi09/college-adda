import { useState } from 'react';
import { useSections } from '../hooks/queries';
import { BRANCHES, SECTIONS, YEARS } from '../lib/constants';
import { Field } from './ui';

/**
 * Branch / year / section selects for sign-up and profile. Only sections that have an
 * official timetable are offered (e.g. CSE Y2: A–O, SA–SK, DA–DJ), so every student
 * lands in a section with real classes. Falls back to the full lists until the catalog loads.
 */
export function SectionFields({
  defaults,
  error,
}: {
  defaults?: { branch: string; year: number; section: string };
  error?: string;
}) {
  const { data: sections } = useSections();
  const catalog = (sections ?? []).filter((s) => s.slots > 0);
  const branches = catalog.length ? [...new Set(catalog.map((s) => s.branch))] : [...BRANCHES];
  const [branch, setBranch] = useState(defaults?.branch ?? '');
  const shownBranch = catalog.length && !branches.includes(branch) ? (branches.length === 1 ? branches[0]! : '') : branch;
  const years = catalog.length ? [...new Set(catalog.filter((s) => s.branch === shownBranch).map((s) => s.year))].sort() : [...YEARS];
  const [year, setYear] = useState(String(defaults?.year ?? 2));
  const shownYear = years.length && !years.map(String).includes(year) ? String(years[0]) : year;

  const known = catalog.filter((s) => s.branch === shownBranch && String(s.year) === shownYear);
  const options = catalog.length
    ? known.map((s) => ({ value: s.section, label: s.label ? `${s.section} — ${s.label}` : s.section }))
    : SECTIONS.map((s) => ({ value: s, label: s }));

  return (
    <div className="form-grid form-grid--3">
      <Field label="BRANCH">
        <select className="select" name="branch" required value={shownBranch} onChange={(e) => setBranch(e.target.value)}>
          <option value="" disabled>
            Select…
          </option>
          {branches.map((b) => (
            <option key={b}>{b}</option>
          ))}
        </select>
      </Field>
      <Field label="YEAR">
        <select className="select" name="year" value={shownYear} onChange={(e) => setYear(e.target.value)}>
          {years.map((y) => (
            <option key={y} value={y}>
              Year {y}
            </option>
          ))}
        </select>
      </Field>
      <Field label="SECTION" error={error}>
        {/* key: reset the choice when the list changes */}
        <select className="select" name="section" required key={`${shownBranch}|${shownYear}`} defaultValue={defaults?.section ?? ''}>
          <option value="" disabled>
            Select…
          </option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}
