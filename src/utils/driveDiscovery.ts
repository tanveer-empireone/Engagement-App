export interface DriveDiscoveryItem {
  id: string;
  parents?: string[];
  [key: string]: unknown;
}

/** Merge normal root children with items shared directly to the current user. */
export function mergeDriveRootChildren<T extends DriveDiscoveryItem>(
  rootFolderId: string,
  directChildren: T[],
  sharedItems: T[]
): T[] {
  const byId = new Map(directChildren.map((item) => [item.id, item]));
  for (const item of sharedItems) {
    if (item.parents?.includes(rootFolderId) && !byId.has(item.id)) {
      byId.set(item.id, item);
    }
  }
  return [...byId.values()];
}
