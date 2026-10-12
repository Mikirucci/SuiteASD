import argon2 from 'argon2';

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  // Resolves false (never throws) for a malformed hash or a wrong password.
  verify(hash: string, password: string): Promise<boolean>;
}

// Argon2id with the OWASP minimum profile (19 MiB, t=2, p=1); memory is configurable for fast tests.
export function createPasswordHasher(memoryKiB: number): PasswordHasher {
  return {
    hash: (password) =>
      argon2.hash(password, { type: argon2.argon2id, memoryCost: memoryKiB, timeCost: 2, parallelism: 1 }),
    verify: async (hash, password) => {
      try {
        return await argon2.verify(hash, password);
      } catch {
        return false;
      }
    },
  };
}
