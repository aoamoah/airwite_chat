import { hash, verify } from '@node-rs/argon2';

/**
 * `Algorithm.Argon2id`, written out because the library declares it as an
 * ambient const enum, which this project's `isolatedModules` build cannot read.
 */
const ARGON2ID = 2;

/**
 * Argon2id at the OWASP baseline: 19 MiB of memory, two passes, one lane.
 *
 * The memory cost is the point — it is what makes a stolen hash expensive to
 * attack on GPUs. These values are recorded in the encoded hash itself, so
 * raising them later does not invalidate existing passwords; each one is
 * verified with the parameters it was created under.
 */
const OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(plaintext: string): Promise<string> {
  return hash(plaintext, OPTIONS);
}

/** Verifies a password. A malformed stored hash counts as a failure, not a crash. */
export async function verifyPassword(storedHash: string, plaintext: string): Promise<boolean> {
  try {
    return await verify(storedHash, plaintext, OPTIONS);
  } catch {
    return false;
  }
}
