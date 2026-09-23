/**
 * Config validation (CLAUDE.md §5).
 *
 * A malformed config must fail loudly at startup, not silently three rooms in. A typo
 * that turns gravity into `NaN` otherwise surfaces as a player falling through the
 * floor, which is a long way from its cause.
 */

export type Rule = 'finite' | 'positive' | 'nonNegative';

/**
 * Throws on the first bad field, naming it. Returns the input so it can wrap a config
 * at its definition site.
 *
 * Keying the rules to `keyof T` means a renamed field breaks the typecheck rather than
 * silently going unvalidated.
 */
export function validateNumbers<T extends object>(
  name: string,
  config: T,
  rules: Readonly<Partial<Record<keyof T & string, Rule>>>,
): T {
  // Built once at startup, so fields can be read by name without a cast.
  const fields = new Map<string, unknown>(Object.entries(config));

  for (const [field, rule] of Object.entries(rules)) {
    if (rule === undefined) continue;

    // A rule naming a field that no longer exists is a stale rule, not a pass.
    if (!fields.has(field)) {
      throw new Error(`${name}.${field}: validated but missing from the config`);
    }
    const value = fields.get(field);

    if (typeof value !== 'number') {
      throw new Error(`${name}.${field}: expected a number, got ${typeof value}`);
    }
    if (!Number.isFinite(value)) {
      throw new Error(`${name}.${field}: expected a finite number, got ${String(value)}`);
    }
    if (rule === 'positive' && value <= 0) {
      throw new Error(`${name}.${field}: expected a positive number, got ${value}`);
    }
    if (rule === 'nonNegative' && value < 0) {
      throw new Error(`${name}.${field}: expected zero or more, got ${value}`);
    }
  }

  return config;
}
