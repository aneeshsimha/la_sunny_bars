import fs from 'fs/promises';
import path from 'path';

const CACHE_DIR = path.join(process.cwd(), '.pipeline-cache');

async function ensureCacheDir(): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
}

function keyToPath(key: string): string {
  return path.join(CACHE_DIR, `${key}.json`);
}

const cache = {
  async get(key: string): Promise<unknown | null> {
    try {
      const raw = await fs.readFile(keyToPath(key), 'utf-8');
      return JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  },

  async set(key: string, value: unknown): Promise<void> {
    await ensureCacheDir();
    await fs.writeFile(keyToPath(key), JSON.stringify(value, null, 2), 'utf-8');
  },

  async has(key: string): Promise<boolean> {
    try {
      await fs.access(keyToPath(key));
      return true;
    } catch {
      return false;
    }
  },

  async clear(): Promise<void> {
    try {
      const files = await fs.readdir(CACHE_DIR);
      await Promise.all(
        files
          .filter((f) => f.endsWith('.json'))
          .map((f) => fs.unlink(path.join(CACHE_DIR, f)))
      );
    } catch {
      // Cache dir doesn't exist — nothing to clear
    }
  },
};

export default cache;
