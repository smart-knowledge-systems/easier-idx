// ---------------------------------------------------------------------------
// SQL identifier validation — defense-in-depth against injection via
// table/column names interpolated into query strings.
// ---------------------------------------------------------------------------

const SAFE_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Assert that `value` is a safe SQL identifier (table name, column name, alias).
 * Throws if the value contains characters that could enable SQL injection.
 */
export function assertSafeIdentifier(value: string, label: string): void {
  if (!SAFE_IDENTIFIER.test(value)) {
    throw new Error(
      `Unsafe SQL identifier for ${label}: "${value}". ` +
        `Identifiers must match /^[a-zA-Z_][a-zA-Z0-9_]*$/.`,
    );
  }
}
