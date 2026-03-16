import path from "path";
import os from "os";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deepMerge(base: any, override: any): any {
  return Object.keys(override).reduce(
    (acc, key) => {
      const val = override[key];
      if (val !== undefined && val !== null && typeof val === "object" && !Array.isArray(val)) {
        return { ...acc, [key]: deepMerge(acc[key] ?? {}, val) };
      }
      return val !== undefined ? { ...acc, [key]: val } : acc;
    },
    { ...base },
  );
}

async function loadJsonFile<T>(filePath: string): Promise<Partial<T>> {
  try {
    const file = Bun.file(filePath);
    if (await file.exists()) {
      return (await file.json()) as Partial<T>;
    }
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
  const globalPath = path.join(os.homedir(), ".config", appName, "config.json");
  const localFile = `.${appName}.json`;
  const localPath = projectRoot ? path.join(projectRoot, localFile) : localFile;

  const [global, local] = await Promise.all([
    loadJsonFile<T>(globalPath),
    loadJsonFile<T>(localPath),
  ]);

  return deepMerge(deepMerge(defaults, global), local) as T;
}

export function getGlobalConfigPath(appName: string): string {
  return path.join(os.homedir(), ".config", appName, "config.json");
}

export async function writeGlobalConfig<T>(appName: string, config: Partial<T>): Promise<string> {
  const configPath = getGlobalConfigPath(appName);
  const dir = path.dirname(configPath);
  const { mkdirSync } = await import("fs");
  mkdirSync(dir, { recursive: true });
  await Bun.write(configPath, JSON.stringify(config, null, 2) + "\n");
  return configPath;
}

export { deepMerge };
