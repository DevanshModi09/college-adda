export const BRANCHES = [
  'CSE',
  'CSE (AI & ML)',
  'CSE (Data Science)',
  'CSE (Cyber Security)',
  'IT',
  'ECE',
  'EE',
  'ME',
  'CE',
  'BCA',
  'MCA',
  'BBA',
  'MBA',
  'B.Des',
  'Other',
] as const;

export const YEARS = [1, 2, 3, 4, 5] as const;

export const SECTIONS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;

/** 'CSE|3|B' -> 'CSE · Y3 · B' */
export const sectionLabel = (key: string) => {
  const [branch, year, section] = key.split('|');
  return `${branch} · Y${year} · ${section}`;
};
export const sectionKeyOf = (u: { branch: string; year: number; section: string }) => `${u.branch}|${u.year}|${u.section}`;

export const EVENT_CATEGORIES = ['Study Group', 'Hackathon', 'Workshop', 'Club Meet', 'Fest', 'Sports', 'Meetup'] as const;
