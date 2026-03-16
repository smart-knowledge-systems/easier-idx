import { SQL } from "bun";

let _pg: InstanceType<typeof SQL> | null = null;

export interface PgConfig {
  readonly host: string;
  readonly port: number;
  readonly database: string;
  readonly user: string;
}

/** Open (or return cached) PostgreSQL connection pool. */
export function getPg(config: PgConfig, maxConnections = 20): InstanceType<typeof SQL> {
  if (_pg) return _pg;
  _pg = new SQL({
    hostname: config.host,
    port: config.port,
    database: config.database,
    username: config.user,
    max: maxConnections,
  });
  return _pg;
}

export async function pgUnsafe(
  config: PgConfig,
  sql: string,
  params: unknown[] = [],
): Promise<unknown[]> {
  const pg = getPg(config);
  return pg.unsafe(sql, params as never[]);
}

export async function closePg(): Promise<void> {
  if (_pg) {
    await _pg.close();
    _pg = null;
  }
}
