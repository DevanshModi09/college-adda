// Preloaded before every test file (see the `test` script): point the app at the Neon *test*
// branch. The API tests wipe every table, so they must never run against the real database.
const url = process.env.TEST_DATABASE_URL;
if (!url) {
  console.error('TEST_DATABASE_URL is not set. Add your Neon test branch URL to server/.env (see .env.example).');
  process.exit(1);
}
if (process.env.DATABASE_URL && process.env.DATABASE_URL === url) {
  console.error('TEST_DATABASE_URL must point at a separate test branch, not the app database.');
  process.exit(1);
}
process.env.DATABASE_URL = url;
process.env.NODE_ENV = 'test';
// Never upload to the real Cloudinary account from tests; the Cloudinary test fakes it itself.
delete process.env.CLOUDINARY_URL;
