/**
 * Read an optional environment variable.
 *
 * Blank values are normalised to `undefined` so that a key left empty in
 * `.env.local` (the default state after copying `.env.example`) still triggers
 * the caller's fallback instead of producing an empty-string credential.
 */
export function readEnv(value: string | undefined | null): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Read an environment variable, returning `fallback` when unset or blank. */
export function readEnvOr(value: string | undefined | null, fallback: string): string {
  return readEnv(value) ?? fallback;
}
