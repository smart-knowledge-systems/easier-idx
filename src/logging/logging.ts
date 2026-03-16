import { createHash } from "crypto";

// ---------------------------------------------------------------------------
// Correlation context
// ---------------------------------------------------------------------------

interface CorrelationContext {
  sessionId: string;
  [key: string]: unknown; // domain-specific fields (repoId, collectionId, etc.)
}

const SESSION_ID = createHash("sha256")
  .update(`${process.pid}-${Date.now()}-${Math.random()}`)
  .digest("hex")
  .slice(0, 16);

let globalCorrelation: CorrelationContext = { sessionId: SESSION_ID };

export function setCorrelationContext(ctx: Partial<CorrelationContext>): void {
  globalCorrelation = { ...globalCorrelation, ...ctx };
}

export function getSessionId(): string {
  return SESSION_ID;
}

// ---------------------------------------------------------------------------
// Path hashing — avoid logging raw file system paths (PII-adjacent)
// STEERING #1 (discovery layer — don't leak paths)
// ---------------------------------------------------------------------------

/** Hash a path to a 16-char hex string to avoid logging PII-adjacent filesystem paths. */
export function hashPath(p: string): string {
  return createHash("sha256").update(p).digest("hex").slice(0, 16);
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

let validDomains: Set<string> | null = null;
let envVar = "EASIER_LOG_EVENTS";

/** Initialize logging with domain-specific configuration. */
export function initLogging(opts: {
  domains: string[];
  envVar?: string;
}): void {
  validDomains = new Set(opts.domains);
  if (opts.envVar) envVar = opts.envVar;
}

// ---------------------------------------------------------------------------
// Structured log events
// ---------------------------------------------------------------------------

interface LogEvent {
  event: string;
  duration_ms?: number;
  sessionId?: string;
  [key: string]: unknown;
}

function isEnabled(): boolean {
  return process.env[envVar] === "1";
}

function isValidEventName(event: string): boolean {
  if (!validDomains) return true; // no domain restriction if not configured
  const dotIndex = event.indexOf(".");
  if (dotIndex <= 0) return false;
  const domain = event.slice(0, dotIndex);
  return validDomains.has(domain);
}

export function logEvent(event: LogEvent): void {
  if (!isEnabled()) return;
  if (!isValidEventName(event.event)) return;
  const entry = {
    ts: new Date().toISOString(),
    sessionId: globalCorrelation.sessionId,
    ...event,
  };
  process.stderr.write(JSON.stringify(entry) + "\n");
}

// ---------------------------------------------------------------------------
// Timing wrappers
// ---------------------------------------------------------------------------

interface StructuredError {
  "error.type": string;
  "error.message": string;
  "error.retriable"?: boolean;
}

function toStructuredError(err: unknown): StructuredError {
  if (err instanceof Error) {
    return { "error.type": err.constructor.name, "error.message": err.message };
  }
  return { "error.type": "Unknown", "error.message": String(err) };
}

export function withTimingSync<T>(
  event: string,
  extra: Record<string, unknown>,
  fn: () => T,
): T {
  if (!isEnabled()) return fn();
  const start = performance.now();
  try {
    const result = fn();
    logEvent({
      event,
      duration_ms: Math.round(performance.now() - start),
      ...extra,
    });
    return result;
  } catch (err) {
    logEvent({
      event,
      duration_ms: Math.round(performance.now() - start),
      ...extra,
      ...toStructuredError(err),
    });
    throw err;
  }
}

export async function withTimingAsync<T>(
  event: string,
  extra: Record<string, unknown>,
  fn: () => Promise<T>,
): Promise<T> {
  if (!isEnabled()) return fn();
  const start = performance.now();
  try {
    const result = await fn();
    logEvent({
      event,
      duration_ms: Math.round(performance.now() - start),
      ...extra,
    });
    return result;
  } catch (err) {
    logEvent({
      event,
      duration_ms: Math.round(performance.now() - start),
      ...extra,
      ...toStructuredError(err),
    });
    throw err;
  }
}
