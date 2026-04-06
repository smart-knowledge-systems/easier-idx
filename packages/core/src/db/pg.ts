import { createRequire } from "node:module";

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

/** Build a parameterized SQL string from a tagged template literal. */
function buildTaggedQuery(
  strings: TemplateStringsArray,
  values: unknown[],
): { sql: string; params: unknown[] } {
  let sql = strings[0];
  for (let i = 0; i < values.length; i++) {
    sql += `$${i + 1}${strings[i + 1]}`;
  }
  return { sql, params: values };
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
    const tx = async <T>(
      sqlOrStrings: string | TemplateStringsArray,
      ...paramsOrValues: unknown[]
    ): Promise<T[]> => {
      if (typeof sqlOrStrings === "string") {
        return (await bunTx.unsafe(
          sqlOrStrings,
          paramsOrValues[0] as never[],
        )) as T[];
      }
      const { sql, params } = buildTaggedQuery(sqlOrStrings, paramsOrValues);
      return (await bunTx.unsafe(sql, params as never[])) as T[];
    };
    tx.unsafe = async <T>(sql: string, params?: unknown[]) =>
      (await bunTx.unsafe(sql, params as never[])) as T[];
    return tx as PgTx;
  };

  const client = async <T>(
    sqlOrStrings: string | TemplateStringsArray,
    ...paramsOrValues: unknown[]
  ): Promise<T[]> => {
    if (typeof sqlOrStrings === "string") {
      return (await pg.unsafe(
        sqlOrStrings,
        paramsOrValues[0] as never[],
      )) as T[];
    }
    const { sql, params } = buildTaggedQuery(sqlOrStrings, paramsOrValues);
    return (await pg.unsafe(sql, params as never[])) as T[];
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
  const tx = async <T>(
    sqlOrStrings: string | TemplateStringsArray,
    ...paramsOrValues: unknown[]
  ): Promise<T[]> => {
    if (typeof sqlOrStrings === "string") {
      const result = await queryFn<T>(
        sqlOrStrings,
        paramsOrValues[0] as unknown[],
      );
      return result.rows;
    }
    const { sql, params } = buildTaggedQuery(sqlOrStrings, paramsOrValues);
    const result = await queryFn<T>(sql, params);
    return result.rows;
  };
  tx.unsafe = async <T>(sql: string, params?: unknown[]) => {
    const result = await queryFn<T>(sql, params);
    return result.rows;
  };
  return tx as PgTx;
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

  const client = async <T>(
    sqlOrStrings: string | TemplateStringsArray,
    ...paramsOrValues: unknown[]
  ): Promise<T[]> => {
    if (typeof sqlOrStrings === "string") {
      const result = await pool.query<T>(
        sqlOrStrings,
        paramsOrValues[0] as unknown[],
      );
      return result.rows;
    }
    const { sql, params } = buildTaggedQuery(sqlOrStrings, paramsOrValues);
    const result = await pool.query<T>(sql, params);
    return result.rows;
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
