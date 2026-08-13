import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { parseEnv } from 'node:util';
import { defineConfig, env } from 'prisma/config';

/**
 * Prisma 7 no longer reads .env files on its own, but this project keeps its
 * connection string in .env.local along with everything else Next.js loads.
 * Parsed here with Node's own parser so the CLI needs no extra dependency.
 * Existing environment variables win, so CI and Render stay in control.
 */
for (const file of ['.env.local', '.env']) {
  try {
    const parsed = parseEnv(readFileSync(path.join(process.cwd(), file), 'utf8'));
    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key] === undefined && typeof value === 'string') {
        process.env[key] = value;
      }
    }
  } catch {
    // No such file is normal; the environment may already carry the values.
  }
}

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
