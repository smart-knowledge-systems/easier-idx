import path from "path";
import os from "os";
import { mkdir, readFile, writeFile } from "fs/promises";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deepMerge(base: any, override: any): any {
  return Object.keys(override).reduce(
    (acc, key) => {
      const val = override[key];
      if (
        val !== undefined &&
        val !== null &&
        typeof val === "object" &&
        !Array.isArray(val)
      ) {
        return { ...acc, [key]: deepMerge(acc[key] ?? {}, val) };
      }
      return val !== undefined ? { ...acc, [key]: val } : acc;
    },
    { ...base },
  );
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

  return deepMerge(deepMerge(defaults, global), local) as T;
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
