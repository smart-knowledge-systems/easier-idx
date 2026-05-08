import { createRequire } from "node:module";

const PG_LIST_MARKER = Symbol.for("@easier-idx/core/PgList");

/**
 * Multi-parameter list helper for `IN` clauses.
 *
 * Created by calling a `PgTx` with a single array argument, e.g.
 * ``pg`WHERE id IN ${pg([1, 2, 3])}` ``. Expands to `($1, $2, $3)` with
 * each item bound as a separate parameter, sidestepping driver-level
 * array encoding (notably Bun's `bun:sql` `Array.prototype.toString`
 * behavior that PostgreSQL 18 rejects).
 */
export interface PgList<T = unknown> {
  readonly [PG_LIST_MARKER]: true;
  readonly items: readonly T[];
}

/** @internal */
export function makePgList<T>(items: readonly T[]): PgList<T> {
  return { [PG_LIST_MARKER]: true, items };
}

/** @internal */
export function isPgList(value: unknown): value is PgList {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<symbol, unknown>)[PG_LIST_MARKER] === true
  );
}

function isTemplateStringsArray(value: unknown): value is TemplateStringsArray {
  if (!Array.isArray(value)) return false;
  const candidate = value as unknown as { raw?: unknown };
  return Array.isArray(candidate.raw);
}

export interface PgTx {
  unsafe<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<T[]>;
  /** Tagged template literal query — e.g. pg\`SELECT * FROM users WHERE id = ${id}\` */
  <T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]>;
  /**
   * List helper for `IN` clauses — e.g. pg\`WHERE id IN ${pg([1, 2, 3])}\`
   * expands to `IN ($1, $2, $3)` with each item as a separate parameter.
   * An empty array expands to `(NULL)`, which never matches.
   */
  <T>(items: readonly T[]): PgList<T>;
}

export interface PgClient extends PgTx {
  begin<T>(fn: (tx: PgTx) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

const pgClients = new Map<string, PgClient>();

export interface PgConfig {
  readonly host: string;
  readonly port: number;
  readonly database: string;
  readonly user: string;
}

type PgQueryResult<T> = { rows: T[] };

interface NodePgPoolClient {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<PgQueryResult<T>>;
  release(): void;
}

interface NodePgPool {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<PgQueryResult<T>>;
  connect(): Promise<NodePgPoolClient>;
  end(): Promise<void>;
}

const require = createRequire(import.meta.url);

function isBunRuntime(): boolean {
  return typeof Bun !== "undefined" && typeof Bun.SQL === "function";
}

/**
 * Build a parameterized SQL string from a tagged template literal.
 *
 * `PgList` values are expanded inline as `($k, $k+1, ...)` with their items
 * flattened into the parameter list. All other values become a single `$N`
 * binding. Placeholder numbering tracks the actual parameter list, so list
 * expansion does not desync downstream `$N` references.
 *
 * @internal Exported for tests; not part of the public API.
 */
export function buildTaggedQuery(
  strings: TemplateStringsArray,
  values: unknown[],
): { sql: string; params: unknown[] } {
  let sql = strings[0];
  const params: unknown[] = [];
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    if (isPgList(value)) {
      if (value.items.length === 0) {
        sql += "(NULL)";
      } else {
        const placeholders: string[] = [];
        for (const item of value.items) {
          params.push(item);
          placeholders.push(`$${params.length}`);
        }
        sql += `(${placeholders.join(",")})`;
      }
    } else {
      params.push(value);
      sql += `$${params.length}`;
    }
    sql += strings[i + 1];
  }
  return { sql, params };
}

function createBunPgClient(config: PgConfig, maxConnections: number): PgClient {
  const pg = new Bun.SQL({
    hostname: config.host,
    port: config.port,
    database: config.database,
    username: config.user,
    max: maxConnections,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const makeTx = (bunTx: { unsafe: (...args: any[]) => any }): PgTx => {
    const tx = (
      sqlOrStringsOrItems: string | TemplateStringsArray | readonly unknown[],
      ...paramsOrValues: unknown[]
    ): Promise<unknown[]> | PgList => {
      if (typeof sqlOrStringsOrItems === "string") {
        return bunTx.unsafe(
          sqlOrStringsOrItems,
          paramsOrValues[0] as never[],
        ) as Promise<unknown[]>;
      }
      if (
        paramsOrValues.length === 0 &&
        Array.isArray(sqlOrStringsOrItems) &&
        !isTemplateStringsArray(sqlOrStringsOrItems)
      ) {
        return makePgList(sqlOrStringsOrItems);
      }
      const { sql, params } = buildTaggedQuery(
        sqlOrStringsOrItems as TemplateStringsArray,
        paramsOrValues,
      );
      return bunTx.unsafe(sql, params as never[]) as Promise<unknown[]>;
    };
    (tx as unknown as { unsafe: PgTx["unsafe"] }).unsafe = async <T>(
      sql: string,
      params?: unknown[],
    ) => (await bunTx.unsafe(sql, params as never[])) as T[];
    return tx as unknown as PgTx;
  };

  const client = (
    sqlOrStringsOrItems: string | TemplateStringsArray | readonly unknown[],
    ...paramsOrValues: unknown[]
  ): Promise<unknown[]> | PgList => {
    if (typeof sqlOrStringsOrItems === "string") {
      return pg.unsafe(
        sqlOrStringsOrItems,
        paramsOrValues[0] as never[],
      ) as Promise<unknown[]>;
    }
    if (
      paramsOrValues.length === 0 &&
      Array.isArray(sqlOrStringsOrItems) &&
      !isTemplateStringsArray(sqlOrStringsOrItems)
    ) {
      return makePgList(sqlOrStringsOrItems);
    }
    const { sql, params } = buildTaggedQuery(
      sqlOrStringsOrItems as TemplateStringsArray,
      paramsOrValues,
    );
    return pg.unsafe(sql, params as never[]) as Promise<unknown[]>;
  };
  client.unsafe = async <T>(sql: string, params?: unknown[]) =>
    (await pg.unsafe(sql, params as never[])) as T[];
  client.begin = async <T>(fn: (tx: PgTx) => Promise<T>) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pg.begin(async (bunTx: { unsafe: (...args: any[]) => any }) =>
      fn(makeTx(bunTx)),
    );
  client.close = async () => {
    await pg.close();
  };
  return client as unknown as PgClient;
}

function loadNodePgPool(): new (config: {
  host: string;
  port: number;
  database: string;
  user: string;
  max: number;
}) => NodePgPool {
  try {
    const mod = require("pg") as {
      Pool: new (config: {
        host: string;
        port: number;
        database: string;
        user: string;
        max: number;
      }) => NodePgPool;
    };
    return mod.Pool;
  } catch (err) {
    throw new Error(
      "Node PostgreSQL fallback requires the optional dependency `pg` to be installed.",
      { cause: err },
    );
  }
}

function makeNodeTx(queryFn: NodePgPoolClient["query"]): PgTx {
  const tx = (
    sqlOrStringsOrItems: string | TemplateStringsArray | readonly unknown[],
    ...paramsOrValues: unknown[]
  ): Promise<unknown[]> | PgList => {
    if (typeof sqlOrStringsOrItems === "string") {
      return queryFn(sqlOrStringsOrItems, paramsOrValues[0] as unknown[]).then(
        (r) => r.rows,
      );
    }
    if (
      paramsOrValues.length === 0 &&
      Array.isArray(sqlOrStringsOrItems) &&
      !isTemplateStringsArray(sqlOrStringsOrItems)
    ) {
      return makePgList(sqlOrStringsOrItems);
    }
    const { sql, params } = buildTaggedQuery(
      sqlOrStringsOrItems as TemplateStringsArray,
      paramsOrValues,
    );
    return queryFn(sql, params).then((r) => r.rows);
  };
  (tx as unknown as { unsafe: PgTx["unsafe"] }).unsafe = async <T>(
    sql: string,
    params?: unknown[],
  ) => {
    const result = await queryFn<T>(sql, params);
    return result.rows;
  };
  return tx as unknown as PgTx;
}

function createNodePgClient(
  config: PgConfig,
  maxConnections: number,
): PgClient {
  const Pool = loadNodePgPool();
  const pool = new Pool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    max: maxConnections,
  });

  const client = (
    sqlOrStringsOrItems: string | TemplateStringsArray | readonly unknown[],
    ...paramsOrValues: unknown[]
  ): Promise<unknown[]> | PgList => {
    if (typeof sqlOrStringsOrItems === "string") {
      return pool
        .query(sqlOrStringsOrItems, paramsOrValues[0] as unknown[])
        .then((r) => r.rows);
    }
    if (
      paramsOrValues.length === 0 &&
      Array.isArray(sqlOrStringsOrItems) &&
      !isTemplateStringsArray(sqlOrStringsOrItems)
    ) {
      return makePgList(sqlOrStringsOrItems);
    }
    const { sql, params } = buildTaggedQuery(
      sqlOrStringsOrItems as TemplateStringsArray,
      paramsOrValues,
    );
    return pool.query(sql, params).then((r) => r.rows);
  };
  client.unsafe = async <T>(sql: string, params?: unknown[]) => {
    const result = await pool.query<T>(sql, params);
    return result.rows;
  };
  client.begin = async <T>(fn: (tx: PgTx) => Promise<T>) => {
    const pgClient = await pool.connect();
    try {
      await pgClient.query("BEGIN");
      const tx = makeNodeTx(pgClient.query.bind(pgClient));
      const result = await fn(tx);
      await pgClient.query("COMMIT");
      return result;
    } catch (err) {
      await pgClient.query("ROLLBACK");
      throw err;
    } finally {
      pgClient.release();
    }
  };
  client.close = async () => {
    await pool.end();
  };
  return client as unknown as PgClient;
}

/** Open (or return cached) PostgreSQL connection pool. */
export function getPg(config: PgConfig, maxConnections = 20): PgClient {
  const key = `${config.host}:${config.port}:${config.database}:${config.user}:${maxConnections}`;
  const cached = pgClients.get(key);
  if (cached) return cached;
  const client = isBunRuntime()
    ? createBunPgClient(config, maxConnections)
    : createNodePgClient(config, maxConnections);
  pgClients.set(key, client);
  return client;
}

export async function pgUnsafe(
  config: PgConfig,
  sql: string,
  params: unknown[] = [],
): Promise<unknown[]> {
  const pg = getPg(config);
  return pg.unsafe(sql, params);
}

export async function closePg(): Promise<void> {
  for (const client of pgClients.values()) {
    await client.close();
  }
  pgClients.clear();
}
