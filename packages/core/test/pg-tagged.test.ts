import { describe, expect, test } from "bun:test";
import { buildTaggedQuery, isPgList, makePgList } from "../src/db/pg";

function tag(strings: TemplateStringsArray, ...values: unknown[]) {
  return buildTaggedQuery(strings, values);
}

describe("buildTaggedQuery", () => {
  test("scalars become sequential $N placeholders", () => {
    const id = 7;
    const name = "alice";
    const out = tag`SELECT * FROM users WHERE id = ${id} AND name = ${name}`;
    expect(out.sql).toBe("SELECT * FROM users WHERE id = $1 AND name = $2");
    expect(out.params).toEqual([7, "alice"]);
  });

  test("PgList expands inline as ($1, $2, ...) with flattened params", () => {
    const ids = makePgList([10, 20, 30]);
    const out = tag`SELECT * FROM files WHERE id IN ${ids}`;
    expect(out.sql).toBe("SELECT * FROM files WHERE id IN ($1,$2,$3)");
    expect(out.params).toEqual([10, 20, 30]);
  });

  test("empty PgList expands to a true empty subquery for IN", () => {
    const empty = makePgList<number>([]);
    const out = tag`SELECT * FROM files WHERE id IN ${empty}`;
    expect(out.sql).toBe(
      "SELECT * FROM files WHERE id IN (SELECT NULL WHERE false)",
    );
    expect(out.params).toEqual([]);
  });

  test("empty PgList works correctly with NOT IN (empty subquery, not NULL)", () => {
    const empty = makePgList<number>([]);
    const out = tag`SELECT * FROM files WHERE id NOT IN ${empty}`;
    expect(out.sql).toBe(
      "SELECT * FROM files WHERE id NOT IN (SELECT NULL WHERE false)",
    );
    expect(out.params).toEqual([]);
  });

  test("scalar before list keeps placeholder numbering in sync", () => {
    const repo = "main";
    const ids = makePgList([1, 2, 3]);
    const out = tag`SELECT * FROM files WHERE repo = ${repo} AND id IN ${ids}`;
    expect(out.sql).toBe(
      "SELECT * FROM files WHERE repo = $1 AND id IN ($2,$3,$4)",
    );
    expect(out.params).toEqual(["main", 1, 2, 3]);
  });

  test("scalar after list resumes numbering past the list", () => {
    const ids = makePgList(["a", "b"]);
    const limit = 50;
    const out = tag`SELECT * FROM t WHERE k IN ${ids} LIMIT ${limit}`;
    expect(out.sql).toBe("SELECT * FROM t WHERE k IN ($1,$2) LIMIT $3");
    expect(out.params).toEqual(["a", "b", 50]);
  });

  test("multiple lists in one query each get independent expansion", () => {
    const repos = makePgList([1, 2]);
    const paths = makePgList(["src/a.ts", "src/b.ts", "src/c.ts"]);
    const out = tag`
      SELECT * FROM files WHERE repo_id IN ${repos} AND file_path IN ${paths}
    `;
    expect(out.sql).toContain("repo_id IN ($1,$2)");
    expect(out.sql).toContain("file_path IN ($3,$4,$5)");
    expect(out.params).toEqual([1, 2, "src/a.ts", "src/b.ts", "src/c.ts"]);
  });

  test("preserves cross-realm PgList values via Symbol.for marker", () => {
    const aliasMarker = Symbol.for("@easier-idx/core/PgList");
    const fakeFromAnotherRealm = {
      [aliasMarker]: true,
      items: [42, 43],
    };
    expect(isPgList(fakeFromAnotherRealm)).toBe(true);
    const out = tag`WHERE id IN ${fakeFromAnotherRealm}`;
    expect(out.sql).toBe("WHERE id IN ($1,$2)");
    expect(out.params).toEqual([42, 43]);
  });
});
