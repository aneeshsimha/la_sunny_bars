export interface Occluder {
  polygon: [number, number][];
  height: number;
  opacity?: number;
}

export interface NeighborhoodManifestEntry {
  slug: string;
  name: string;
  venueCount: number;
  buildingCount: number;
}

interface BuildingsFile {
  slug: string;
  count: number;
  occluders: Occluder[];
}

interface TreesFile {
  slug: string;
  count: number;
  occluders: Occluder[];
}

// In-memory cache: slug → occluders (buildings and trees cached separately)
const buildingCache = new Map<string, Occluder[]>();
const treeCache = new Map<string, Occluder[]>();

/**
 * Load building occluders for a neighborhood from the static JSON file.
 * Results are cached in memory to avoid redundant fetches.
 */
export async function loadBuildingOccluders(slug: string): Promise<Occluder[]> {
  if (buildingCache.has(slug)) return buildingCache.get(slug)!;

  const res = await fetch(`/data/${slug}/buildings.json`);
  if (!res.ok) throw new Error(`Failed to load buildings for ${slug}: ${res.status}`);

  const data: BuildingsFile = await res.json();
  buildingCache.set(slug, data.occluders);
  return data.occluders;
}

/**
 * Load tree/awning occluders for a neighborhood from the static JSON file.
 * Falls back to an empty array if the file is not found (404).
 * Results are cached in memory to avoid redundant fetches.
 */
export async function loadTreeOccluders(slug: string): Promise<Occluder[]> {
  if (treeCache.has(slug)) return treeCache.get(slug)!;

  const res = await fetch(`/data/${slug}/trees.json`);
  if (res.status === 404) {
    treeCache.set(slug, []);
    return [];
  }
  if (!res.ok) throw new Error(`Failed to load trees for ${slug}: ${res.status}`);

  const data: TreesFile = await res.json();
  treeCache.set(slug, data.occluders);
  return data.occluders;
}

/**
 * Load all occluders (buildings + trees/awnings) for a neighborhood.
 * Tree occluders are expected to carry opacity < 1 for partial shade.
 */
export async function loadAllOccluders(slug: string): Promise<Occluder[]> {
  const [buildings, trees] = await Promise.all([
    loadBuildingOccluders(slug),
    loadTreeOccluders(slug),
  ]);
  return [...buildings, ...trees];
}

export function clearBuildingCache(): void {
  buildingCache.clear();
  treeCache.clear();
}

interface ManifestFile {
  generatedAt: string;
  neighborhoods: NeighborhoodManifestEntry[];
}

/**
 * Load the neighborhood manifest from /data/index.json if it exists,
 * falling back to /data/neighborhoods.json (which only has slug/name/bbox/center).
 */
export async function loadNeighborhoodManifest(): Promise<NeighborhoodManifestEntry[]> {
  const indexRes = await fetch('/data/index.json');
  if (indexRes.ok) {
    const data: ManifestFile = await indexRes.json();
    if (data.neighborhoods && data.neighborhoods.length > 0) {
      return data.neighborhoods;
    }
  }

  // Fallback: neighborhoods.json has no venueCount/buildingCount, use 0
  const fallbackRes = await fetch('/data/neighborhoods.json');
  if (!fallbackRes.ok) throw new Error(`Failed to load neighborhoods.json: ${fallbackRes.status}`);
  const raw: { slug: string; name: string }[] = await fallbackRes.json();
  return raw.map((n) => ({ slug: n.slug, name: n.name, venueCount: 0, buildingCount: 0 }));
}
