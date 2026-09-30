// Append-only. Each entry runs once, tracked by PRAGMA user_version.
export const migrations: string[] = [
  `
  CREATE TABLE users (
    id            TEXT PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    branch        TEXT NOT NULL DEFAULT '',
    year          INTEGER NOT NULL DEFAULT 1,
    bio           TEXT NOT NULL DEFAULT '',
    interests     TEXT NOT NULL DEFAULT '[]',
    color         TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    INTEGER NOT NULL
  );

  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX idx_sessions_user ON sessions(user_id);

  CREATE TABLE deadlines (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title      TEXT NOT NULL,
    subject    TEXT NOT NULL DEFAULT '',
    due_at     INTEGER NOT NULL,
    priority   TEXT NOT NULL CHECK (priority IN ('low','med','high')),
    done       INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX idx_deadlines_user_due ON deadlines(user_id, due_at);

  CREATE TABLE classes (
    id       TEXT PRIMARY KEY,
    user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day      INTEGER NOT NULL CHECK (day BETWEEN 0 AND 6),
    start    TEXT NOT NULL,
    end      TEXT NOT NULL,
    subject  TEXT NOT NULL,
    kind     TEXT NOT NULL,
    room     TEXT NOT NULL DEFAULT '',
    teacher  TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX idx_classes_user ON classes(user_id, day, start);

  CREATE TABLE rooms (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    topic      TEXT NOT NULL DEFAULT '',
    lang       TEXT NOT NULL DEFAULT 'Any',
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE room_messages (
    id         TEXT PRIMARY KEY,
    room_id    TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    text       TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX idx_room_messages_room ON room_messages(room_id, created_at);

  CREATE TABLE direct_messages (
    id           TEXT PRIMARY KEY,
    sender_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    text         TEXT NOT NULL,
    created_at   INTEGER NOT NULL,
    read_at      INTEGER
  );
  CREATE INDEX idx_dm_pair ON direct_messages(sender_id, recipient_id, created_at);
  CREATE INDEX idx_dm_recipient ON direct_messages(recipient_id, read_at);

  CREATE TABLE events (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    location    TEXT NOT NULL DEFAULT '',
    category    TEXT NOT NULL,
    start_at    INTEGER NOT NULL,
    end_at      INTEGER,
    created_by  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  INTEGER NOT NULL
  );
  CREATE INDEX idx_events_start ON events(start_at);

  CREATE TABLE event_attendees (
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (event_id, user_id)
  );
  `,

  // 2: timetables belong to a section (branch + year + section letter), not a single user.
  `
  ALTER TABLE users ADD COLUMN section TEXT NOT NULL DEFAULT 'A';

  CREATE TABLE timetable_slots (
    id          TEXT PRIMARY KEY,
    section_key TEXT NOT NULL,
    day         INTEGER NOT NULL CHECK (day BETWEEN 0 AND 6),
    start       TEXT NOT NULL,
    end         TEXT NOT NULL,
    subject     TEXT NOT NULL,
    kind        TEXT NOT NULL,
    room        TEXT NOT NULL DEFAULT '',
    teacher     TEXT NOT NULL DEFAULT '',
    created_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at  INTEGER NOT NULL
  );
  CREATE INDEX idx_slots_section ON timetable_slots(section_key, day, start);

  INSERT INTO timetable_slots (id, section_key, day, start, end, subject, kind, room, teacher, created_by, created_at)
  SELECT c.id, u.branch || '|' || u.year || '|' || u.section, c.day, c.start, c.end, c.subject, c.kind, c.room, c.teacher, c.user_id, 0
  FROM classes c JOIN users u ON u.id = c.user_id;

  DROP TABLE classes;
  `,

  // 3: roles + official deadlines. Official deadlines are posted by admins for everyone
  // (audience '') or one section (audience = section key); completion is per user.
  `
  ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student','admin'));

  CREATE TABLE deadlines_v3 (
    id         TEXT PRIMARY KEY,
    kind       TEXT NOT NULL CHECK (kind IN ('personal','official')),
    owner_id   TEXT REFERENCES users(id) ON DELETE CASCADE,
    audience   TEXT NOT NULL DEFAULT '',
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    title      TEXT NOT NULL,
    subject    TEXT NOT NULL DEFAULT '',
    due_at     INTEGER NOT NULL,
    priority   TEXT NOT NULL CHECK (priority IN ('low','med','high')),
    created_at INTEGER NOT NULL,
    CHECK ((kind = 'personal') = (owner_id IS NOT NULL))
  );

  CREATE TABLE deadline_completions (
    deadline_id TEXT NOT NULL REFERENCES deadlines_v3(id) ON DELETE CASCADE,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    done_at     INTEGER NOT NULL,
    PRIMARY KEY (deadline_id, user_id)
  );

  INSERT INTO deadlines_v3 (id, kind, owner_id, audience, created_by, title, subject, due_at, priority, created_at)
  SELECT id, 'personal', user_id, '', user_id, title, subject, due_at, priority, created_at FROM deadlines;
  INSERT INTO deadline_completions (deadline_id, user_id, done_at)
  SELECT id, user_id, created_at FROM deadlines WHERE done = 1;

  DROP TABLE deadlines;
  ALTER TABLE deadlines_v3 RENAME TO deadlines;
  CREATE INDEX idx_deadlines_owner ON deadlines(owner_id, due_at);
  CREATE INDEX idx_deadlines_official ON deadlines(kind, audience, due_at);
  `,

  // 4: section catalog imported from the official timetable workbook.
  `
  CREATE TABLE sections (
    key    TEXT PRIMARY KEY,
    branch TEXT NOT NULL,
    year   INTEGER NOT NULL,
    code   TEXT NOT NULL,
    label  TEXT NOT NULL DEFAULT '',
    term   TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT ''
  );
  `,

  // 5: friends. One row per pair; requester -> addressee while pending.
  `
  CREATE TABLE friendships (
    requester_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    addressee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status       TEXT NOT NULL CHECK (status IN ('pending','accepted')),
    created_at   INTEGER NOT NULL,
    responded_at INTEGER,
    PRIMARY KEY (requester_id, addressee_id),
    CHECK (requester_id != addressee_id)
  );
  CREATE INDEX idx_friendships_addressee ON friendships(addressee_id, status);
  `,

  // 6: attendance. Marks are per timetable slot per date; the subject is copied so
  // history survives timetable edits. Baselines carry over counts from the ERP.
  `
  CREATE TABLE attendance_marks (
    user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date     TEXT NOT NULL,
    slot_id  TEXT NOT NULL,
    subject  TEXT NOT NULL,
    status   TEXT NOT NULL CHECK (status IN ('present','absent','cancelled')),
    marked_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, date, slot_id)
  );
  CREATE INDEX idx_attendance_user_subject ON attendance_marks(user_id, subject);

  CREATE TABLE attendance_baselines (
    user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject  TEXT NOT NULL,
    attended INTEGER NOT NULL CHECK (attended >= 0),
    held     INTEGER NOT NULL CHECK (held >= attended),
    PRIMARY KEY (user_id, subject)
  );

  CREATE TABLE attendance_settings (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    target  INTEGER NOT NULL DEFAULT 75 CHECK (target BETWEEN 1 AND 100),
    sem_end TEXT
  );
  `,

  // 7: remember whether the student finished (or skipped) the first-run attendance setup.
  `
  ALTER TABLE attendance_settings ADD COLUMN setup_done INTEGER NOT NULL DEFAULT 0;
  `,

  // 8: assignment tracker. No row = not started; one row per (student, subject, assignment #).
  `
  CREATE TABLE assignments (
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject    TEXT NOT NULL,
    number     INTEGER NOT NULL CHECK (number BETWEEN 1 AND 5),
    status     TEXT NOT NULL CHECK (status IN ('todo','doing','submitted')),
    due_at     INTEGER,
    note       TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, subject, number)
  );
  `,

  // 9: guest accounts (one-click demo logins, cleaned up after a day) + section notice boards.
  `
  ALTER TABLE users ADD COLUMN is_guest INTEGER NOT NULL DEFAULT 0;

  CREATE TABLE notices (
    id          TEXT PRIMARY KEY,
    section_key TEXT NOT NULL,
    author_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body        TEXT NOT NULL,
    pinned      INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL
  );
  CREATE INDEX idx_notices_section ON notices(section_key, pinned DESC, created_at DESC);
  `,

  // 10: campus feed. Anyone can post a thought (text and/or one photo); likes are one row
  // per (post, user). Photos live in their own table so listing posts never loads the bytes.
  `
  CREATE TABLE posts (
    id         TEXT PRIMARY KEY,
    author_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body       TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX idx_posts_created ON posts(created_at DESC);

  CREATE TABLE post_images (
    post_id TEXT PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
    mime    TEXT NOT NULL,
    data    BLOB NOT NULL
  );

  CREATE TABLE post_likes (
    post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (post_id, user_id)
  );
  `,
];
