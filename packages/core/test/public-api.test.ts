import { describe, expect, test } from "bun:test";
import packageJson from "../package.json";
import { ROOT_RUNTIME_EXPORTS, SUBPATH_CONTRACT } from "./public-api.contract";

describe("public API contract", () => {
  test("package.json keeps documented entrypoints exported", () => {
    expect(Object.keys(packageJson.exports)).toEqual(
      expect.arrayContaining([
        ".",
        ...SUBPATH_CONTRACT.map((entry) => entry.exportKey),
      ]),
    );
  });

  test("root runtime exports stay backward compatible", async () => {
    const module = await import("@easier-idx/core");

    expect(Object.keys(module)).toEqual(
      expect.arrayContaining([...ROOT_RUNTIME_EXPORTS]),
    );
  });

  for (const entry of SUBPATH_CONTRACT) {
    test(`${entry.specifier} stays importable`, async () => {
      const module = await import(entry.specifier);

      expect(module).toBeDefined();
      if (entry.runtimeExports.length > 0) {
        expect(Object.keys(module)).toEqual(
          expect.arrayContaining([...entry.runtimeExports]),
        );
      }
    });
  }
});
