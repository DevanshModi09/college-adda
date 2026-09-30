import { useState } from 'react';
import { useSections } from '../hooks/queries';
import { BRANCHES, SECTIONS, YEARS } from '../lib/constants';
import { Field } from './ui';

/**
 * Branch / year / section selects for sign-up and profile. Sections come from the
 * official timetable catalog for that branch+year (e.g. CSE Y2: A–O, SA–SK, DA–DJ),
 * falling back to A–H where no catalog exists.
 */
export function SectionFields({
  defaults,
  error,
}: {
  defaults?: { branch: string; year: number; section: string };
  error?: string;
}) {
  const [branch, setBranch] = useState(defaults?.branch ?? '');
  const [year, setYear] = useState(String(defaults?.year ?? 2));
  const { data: sections } = useSections();

  const known = (sections ?? []).filter((s) => s.branch === branch && String(s.year) === year && s.slots > 0);
  const options = known.length
    ? known.map((s) => ({ value: s.section, label: s.label ? `${s.section} — ${s.label}` : s.section }))
    : SECTIONS.map((s) => ({ value: s, label: s }));

  return (
    <div className="form-grid form-grid--3">
      <Field label="BRANCH">
        <select className="select" name="branch" required value={branch} onChange={(e) => setBranch(e.target.value)}>
          <option value="" disabled>
            Select…
          </option>
          {BRANCHES.map((b) => (
            <option key={b}>{b}</option>
          ))}
        </select>
      </Field>
      <Field label="YEAR">
        <select className="select" name="year" value={year} onChange={(e) => setYear(e.target.value)}>
          {YEARS.map((y) => (
            <option key={y} value={y}>
              Year {y}
            </option>
          ))}
        </select>
      </Field>
      <Field label="SECTION" error={error}>
        {/* key: reset the choice when the list changes */}
        <select className="select" name="section" required key={`${branch}|${year}`} defaultValue={defaults?.section ?? ''}>
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
