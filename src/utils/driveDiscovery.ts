export interface DriveDiscoveryItem {
  id: string;
  parents?: string[];
  properties?: Record<string, string>;
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
    const belongsToAppRoot =
      item.parents?.includes(rootFolderId) || item.properties?.engagementAppRootId === rootFolderId;
    if (belongsToAppRoot && !byId.has(item.id)) {
      byId.set(item.id, item);
    }
  }
  return [...byId.values()];
}
