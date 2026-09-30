-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "branch" TEXT NOT NULL DEFAULT '',
    "year" INTEGER NOT NULL DEFAULT 1,
    "section" TEXT NOT NULL DEFAULT 'A',
    "role" TEXT NOT NULL DEFAULT 'student',
    "bio" TEXT NOT NULL DEFAULT '',
    "interests" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "color" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "is_guest" BOOLEAN NOT NULL DEFAULT false,
    "created_at" BIGINT NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "token_hash" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" BIGINT NOT NULL,
    "expires_at" BIGINT NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("token_hash")
);

-- CreateTable
CREATE TABLE "deadlines" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "owner_id" TEXT,
    "audience" TEXT NOT NULL DEFAULT '',
    "created_by" TEXT,
    "title" TEXT NOT NULL,
    "subject" TEXT NOT NULL DEFAULT '',
    "due_at" BIGINT NOT NULL,
    "priority" TEXT NOT NULL,
    "created_at" BIGINT NOT NULL,

    CONSTRAINT "deadlines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deadline_completions" (
    "deadline_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "done_at" BIGINT NOT NULL,

    CONSTRAINT "deadline_completions_pkey" PRIMARY KEY ("deadline_id","user_id")
);

-- CreateTable
CREATE TABLE "sections" (
    "key" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "term" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "sections_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "timetable_slots" (
    "id" TEXT NOT NULL,
    "section_key" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "start" TEXT NOT NULL,
    "end" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "room" TEXT NOT NULL DEFAULT '',
    "teacher" TEXT NOT NULL DEFAULT '',
    "created_by" TEXT,
    "created_at" BIGINT NOT NULL,

    CONSTRAINT "timetable_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "topic" TEXT NOT NULL DEFAULT '',
    "lang" TEXT NOT NULL DEFAULT 'Any',
    "created_by" TEXT,
    "created_at" BIGINT NOT NULL,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_messages" (
    "id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "created_at" BIGINT NOT NULL,

    CONSTRAINT "room_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "direct_messages" (
    "id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "recipient_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "created_at" BIGINT NOT NULL,
    "read_at" BIGINT,

    CONSTRAINT "direct_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL,
    "start_at" BIGINT NOT NULL,
    "end_at" BIGINT,
    "created_by" TEXT NOT NULL,
    "created_at" BIGINT NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_attendees" (
    "event_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "event_attendees_pkey" PRIMARY KEY ("event_id","user_id")
);

-- CreateTable
CREATE TABLE "friendships" (
    "requester_id" TEXT NOT NULL,
    "addressee_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" BIGINT NOT NULL,
    "responded_at" BIGINT,

    CONSTRAINT "friendships_pkey" PRIMARY KEY ("requester_id","addressee_id")
);

-- CreateTable
CREATE TABLE "attendance_marks" (
    "user_id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "slot_id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "marked_at" BIGINT NOT NULL,

    CONSTRAINT "attendance_marks_pkey" PRIMARY KEY ("user_id","date","slot_id")
);

-- CreateTable
CREATE TABLE "attendance_baselines" (
    "user_id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "attended" INTEGER NOT NULL,
    "held" INTEGER NOT NULL,

    CONSTRAINT "attendance_baselines_pkey" PRIMARY KEY ("user_id","subject")
);

-- CreateTable
CREATE TABLE "attendance_settings" (
    "user_id" TEXT NOT NULL,
    "target" INTEGER NOT NULL DEFAULT 75,
    "sem_end" TEXT,
    "setup_done" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "attendance_settings_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "assignments" (
    "user_id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "due_at" BIGINT,
    "note" TEXT NOT NULL DEFAULT '',
    "updated_at" BIGINT NOT NULL,

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("user_id","subject","number")
);

-- CreateTable
CREATE TABLE "notices" (
    "id" TEXT NOT NULL,
    "section_key" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "created_at" BIGINT NOT NULL,

    CONSTRAINT "notices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posts" (
    "id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" BIGINT NOT NULL,
    "image_url" TEXT,
    "image_public_id" TEXT,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_likes" (
    "post_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "post_likes_pkey" PRIMARY KEY ("post_id","user_id")
);

-- CreateTable
CREATE TABLE "post_images" (
    "post_id" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "data" BYTEA NOT NULL,

    CONSTRAINT "post_images_pkey" PRIMARY KEY ("post_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "deadlines_owner_id_due_at_idx" ON "deadlines"("owner_id", "due_at");

-- CreateIndex
CREATE INDEX "deadlines_kind_audience_due_at_idx" ON "deadlines"("kind", "audience", "due_at");

-- CreateIndex
CREATE INDEX "timetable_slots_section_key_day_start_idx" ON "timetable_slots"("section_key", "day", "start");

-- CreateIndex
CREATE INDEX "timetable_slots_day_start_idx" ON "timetable_slots"("day", "start");

-- CreateIndex
CREATE INDEX "room_messages_room_id_created_at_idx" ON "room_messages"("room_id", "created_at");

-- CreateIndex
CREATE INDEX "direct_messages_sender_id_recipient_id_created_at_idx" ON "direct_messages"("sender_id", "recipient_id", "created_at");

-- CreateIndex
CREATE INDEX "direct_messages_recipient_id_read_at_idx" ON "direct_messages"("recipient_id", "read_at");

-- CreateIndex
CREATE INDEX "events_start_at_idx" ON "events"("start_at");

-- CreateIndex
CREATE INDEX "friendships_addressee_id_status_idx" ON "friendships"("addressee_id", "status");

-- CreateIndex
CREATE INDEX "attendance_marks_user_id_subject_idx" ON "attendance_marks"("user_id", "subject");

-- CreateIndex
CREATE INDEX "notices_section_key_pinned_created_at_idx" ON "notices"("section_key", "pinned", "created_at");

-- CreateIndex
CREATE INDEX "posts_created_at_idx" ON "posts"("created_at");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deadlines" ADD CONSTRAINT "deadlines_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deadlines" ADD CONSTRAINT "deadlines_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deadline_completions" ADD CONSTRAINT "deadline_completions_deadline_id_fkey" FOREIGN KEY ("deadline_id") REFERENCES "deadlines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deadline_completions" ADD CONSTRAINT "deadline_completions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_messages" ADD CONSTRAINT "room_messages_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_messages" ADD CONSTRAINT "room_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_messages" ADD CONSTRAINT "direct_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_messages" ADD CONSTRAINT "direct_messages_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_attendees" ADD CONSTRAINT "event_attendees_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_attendees" ADD CONSTRAINT "event_attendees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_addressee_id_fkey" FOREIGN KEY ("addressee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_marks" ADD CONSTRAINT "attendance_marks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_baselines" ADD CONSTRAINT "attendance_baselines_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_settings" ADD CONSTRAINT "attendance_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notices" ADD CONSTRAINT "notices_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_images" ADD CONSTRAINT "post_images_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Hand-written: rules the old SQLite schema enforced that Prisma can't express.
ALTER TABLE "users" ADD CONSTRAINT "users_role_check" CHECK ("role" IN ('student', 'admin'));
ALTER TABLE "deadlines" ADD CONSTRAINT "deadlines_kind_check" CHECK ("kind" IN ('personal', 'official'));
ALTER TABLE "deadlines" ADD CONSTRAINT "deadlines_priority_check" CHECK ("priority" IN ('low', 'med', 'high'));
ALTER TABLE "deadlines" ADD CONSTRAINT "deadlines_owner_check" CHECK (("kind" = 'personal') = ("owner_id" IS NOT NULL));
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_day_check" CHECK ("day" BETWEEN 0 AND 6);
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_status_check" CHECK ("status" IN ('pending', 'accepted'));
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_not_self_check" CHECK ("requester_id" <> "addressee_id");
ALTER TABLE "attendance_marks" ADD CONSTRAINT "attendance_marks_status_check" CHECK ("status" IN ('present', 'absent', 'cancelled'));
ALTER TABLE "attendance_baselines" ADD CONSTRAINT "attendance_baselines_counts_check" CHECK ("attended" >= 0 AND "held" >= "attended");
ALTER TABLE "attendance_settings" ADD CONSTRAINT "attendance_settings_target_check" CHECK ("target" BETWEEN 1 AND 100);
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_number_check" CHECK ("number" BETWEEN 1 AND 5);
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_status_check" CHECK ("status" IN ('todo', 'doing', 'submitted'));
