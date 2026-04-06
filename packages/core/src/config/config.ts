import path from "path";
import os from "os";
import { mkdir, readFile, writeFile } from "fs/promises";

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...base };
  for (const key of Object.keys(override)) {
    const val = override[key];
    if (val === undefined) continue;
    if (isPlainObject(val) && isPlainObject(result[key])) {
      result[key] = deepMerge(result[key] as Record<string, unknown>, val);
    } else {
      result[key] = val;
    }
  }
  return result;
}

async function loadJsonFile<T>(filePath: string): Promise<Partial<T>> {
  try {
    const content = await readFile(filePath, "utf-8");
    return JSON.parse(content) as Partial<T>;
  } catch {
    // ignore missing/invalid config
  }
  return {};
}

/**
 * Load config by merging: defaults → global (~/.config/{appName}/config.json) → local (.{appName}.json).
 * Domain projects call this with their own defaults type.
 */
export async function loadConfig<T>(
  appName: string,
  defaults: T,
  projectRoot?: string,
): Promise<T> {
  validateAppName(appName);
  const globalPath = path.join(os.homedir(), ".config", appName, "config.json");
  const localFile = `.${appName}.json`;
  const localPath = projectRoot ? path.join(projectRoot, localFile) : localFile;

  const [global, local] = await Promise.all([
    loadJsonFile<T>(globalPath),
    loadJsonFile<T>(localPath),
  ]);

  return deepMerge(
    deepMerge(
      defaults as Record<string, unknown>,
      global as Record<string, unknown>,
    ),
    local as Record<string, unknown>,
  ) as T;
}

function validateAppName(appName: string): void {
  if (
    appName.includes("/") ||
    appName.includes("\\") ||
    appName.includes("..")
  ) {
    throw new Error(
      `Invalid appName "${appName}": must not contain path separators or ".."`,
    );
  }
}

export function getGlobalConfigPath(appName: string): string {
  validateAppName(appName);
  return path.join(os.homedir(), ".config", appName, "config.json");
}

export async function writeGlobalConfig<T>(
  appName: string,
  config: Partial<T>,
): Promise<string> {
  const configPath = getGlobalConfigPath(appName);
  const dir = path.dirname(configPath);
  await mkdir(dir, { recursive: true });
  await writeFile(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
  return configPath;
}

export { deepMerge };
