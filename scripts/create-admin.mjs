/**
 * Creates or updates an administrator account.
 *
 *   pnpm admin:create
 *
 * Deliberately independent of the generated Prisma client, so it works on a
 * fresh checkout before anything has been generated or built — this is the tool
 * you reach for when a deployment has no way in yet.
 *
 * Run `pnpm db:deploy` first if the tables do not exist.
 */
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { Writable } from 'node:stream';
import { hash } from '@node-rs/argon2';
import pg from 'pg';

/**
 * Must stay in step with lib/admin/password.ts, which is the source of truth.
 * Argon2 records these in the encoded hash, so an older hash keeps verifying
 * even if the numbers change here later.
 */
const ARGON2_OPTIONS = {
  algorithm: 2 /* Argon2id */,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

const MIN_PASSWORD_LENGTH = 12;

function fail(message) {
  console.error(`\n${message}`);
  process.exit(1);
}

/**
 * Two input modes, because they need genuinely different handling.
 *
 * At a terminal, readline echoes what is typed, so the password prompts point
 * it at a stream that can be silenced. When input is piped, there is no echo to
 * hide and no terminal to drive — and readline would race through buffered
 * lines faster than the prompts ask for them — so the whole of stdin is read
 * once and handed out a line at a time.
 */
const interactive = Boolean(stdin.isTTY);

let muted = false;
const echo = new Writable({
  write(chunk, encoding, callback) {
    if (!muted) stdout.write(chunk, encoding);
    callback();
  },
});

const rl = interactive
  ? createInterface({ input: stdin, output: echo, terminal: true })
  : null;

let pipedLines = null;
let pipedIndex = 0;

async function nextPipedLine() {
  if (pipedLines === null) {
    const chunks = [];
    for await (const chunk of stdin) chunks.push(chunk);
    pipedLines = Buffer.concat(chunks).toString('utf8').split('\n');
  }
  return pipedLines[pipedIndex++] ?? '';
}

async function ask(prompt, { hidden = false } = {}) {
  if (!interactive) return nextPipedLine();
  if (!hidden) return rl.question(prompt);

  stdout.write(prompt);
  muted = true;
  try {
    return await rl.question('');
  } finally {
    muted = false;
    stdout.write('\n');
  }
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  fail('DATABASE_URL is not set. Put it in .env.local, or export it before running.');
}

const requiresTls = !/^(postgres(ql)?:\/\/[^/]*@)?(localhost|127\.0\.0\.1|\[::1\])/.test(
  connectionString,
);

const username = (await ask('Admin username: ')).trim();
if (!username) fail('A username is required.');

const password = await ask('Password: ', { hidden: true });
if (password.length < MIN_PASSWORD_LENGTH) {
  fail(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
}

const confirmation = await ask('Confirm password: ', { hidden: true });
if (password !== confirmation) fail('Passwords do not match.');

rl?.close();

const client = new pg.Client({
  connectionString,
  ssl: requiresTls ? { rejectUnauthorized: true } : undefined,
});

try {
  await client.connect();
  const passwordHash = await hash(password, ARGON2_OPTIONS);

  const { rowCount } = await client.query(
    `UPDATE admins
        SET password_hash = $2, is_active = true, updated_at = now()
      WHERE username = $1`,
    [username, passwordHash],
  );

  if (rowCount > 0) {
    console.log(`\nPassword updated for existing administrator "${username}".`);
  } else {
    await client.query(
      `INSERT INTO admins (id, username, password_hash, role, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, 'admin', true, now(), now())`,
      [randomUUID(), username, passwordHash],
    );
    console.log(`\nAdministrator "${username}" created.`);
  }
  console.log('Sign in at /admin/login');
} catch (cause) {
  if (cause?.code === '42P01') {
    fail('The admins table does not exist yet. Run `pnpm db:deploy` first.');
  }
  fail(`Could not write the administrator: ${cause?.message ?? cause}`);
} finally {
  await client.end().catch(() => {});
}
