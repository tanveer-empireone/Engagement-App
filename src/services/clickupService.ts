/**
 * ClickUp Live Read Service
 * STRICTLY READ-ONLY: All API requests use HTTP GET. No task creation, update, or deletion.
 * The server holds the ClickUp token. The browser only sends its Firebase ID token.
 */
import { apiFetch } from './apiClient';

export const CLICKUP_TEAM_ID = '90161592694';
export const CLICKUP_ENGAGEMENT_SPACE_ID = '1300380000003391';

export interface ClickUpSpace {
  id: string;
  name: string;
  private: boolean;
  statuses?: Array<{ id: string; status: string; type: string; color: string }>;
}

export interface ClickUpFolder {
  id: string;
  name: string;
  orderindex: number;
  lists: ClickUpListSummary[];
}

export interface ClickUpListSummary {
  id: string;
  name: string;
  orderindex: number;
  task_count?: number;
}

export interface ClickUpTaskItem {
  id: string;
  name: string;
  status: { status: string; color: string; type: string };
  orderindex?: string;
  date_created?: string;
  date_updated?: string;
  date_closed?: string;
  creator?: { id: number; username: string; email: string };
  assignees?: Array<{ id: number; username: string; email: string }>;
  list?: { id: string; name: string };
  folder?: { id: string; name: string };
  space?: { id: string };
  url?: string;
  description?: string;
  priority?: { id: string; priority: string; color: string };
  custom_fields?: Array<{ id: string; name: string; value: any }>;
}

export interface LiveClickUpResult {
  space: ClickUpSpace | null;
  folders: ClickUpFolder[];
  lists: ClickUpListSummary[];
  tasks: ClickUpTaskItem[];
  fetchedAt: string;
  isLive: boolean;
}

/**
 * Read ClickUp through the server. The browser does not send a ClickUp token.
 */
async function clickUpGet(path: string): Promise<any> {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const res = await apiFetch(`/api/clickup${cleanPath}`, { method: 'GET' });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `ClickUp API returned ${res.status}`);
  }
  return res.json();
}

/**
 * Test ClickUp token against the target Engagement space (HTTP GET only)
 */
export async function testClickUpConnection(
  spaceId: string = CLICKUP_ENGAGEMENT_SPACE_ID
): Promise<{ success: boolean; message: string; space?: any }> {
  try {
    const data = await clickUpGet(`/space/${spaceId}`);
    return {
      success: true,
      message: `Successfully connected to ClickUp Space "${data.name || 'Engagement'}"!`,
      space: data
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: `ClickUp connection test failed: ${msg}`
    };
  }
}

/**
 * Fetch all folders, lists, and tasks in the Engagement Space.
 * Guaranteed READ-ONLY.
 */
export async function fetchAllLiveClickUpData(
  spaceId: string = CLICKUP_ENGAGEMENT_SPACE_ID
): Promise<LiveClickUpResult> {
  const spaceData = await clickUpGet(`/space/${spaceId}`).catch(() => null);

  // Folders inside the configured space.
  const foldersRes = await clickUpGet(`/space/${spaceId}/folder`).catch(() => ({ folders: [] }));
  const folders: ClickUpFolder[] = (foldersRes.folders || []).map((f: any) => ({
    id: f.id,
    name: f.name,
    orderindex: f.orderindex,
    lists: (f.lists || []).map((l: any) => ({
      id: l.id,
      name: l.name,
      orderindex: l.orderindex,
      task_count: l.task_count
    }))
  }));

  // 3. Fetch folderless lists in space
  const listsRes = await clickUpGet(`/space/${spaceId}/list`).catch(() => ({ lists: [] }));
  const folderlessLists: ClickUpListSummary[] = (listsRes.lists || []).map((l: any) => ({
    id: l.id,
    name: l.name,
    orderindex: l.orderindex,
    task_count: l.task_count
  }));

  // Collect all list IDs
  const allLists: ClickUpListSummary[] = [...folderlessLists];
  folders.forEach((f) => {
    allLists.push(...f.lists);
  });

  // 4. Fetch tasks from up to 5 lists in parallel (HTTP GET only)
  const tasks: ClickUpTaskItem[] = [];
  const targetLists = allLists.slice(0, 5);

  await Promise.all(
    targetLists.map(async (l) => {
      try {
        const taskRes = await clickUpGet(`/list/${l.id}/task?subtasks=true&include_closed=true`);
        const listTasks: any[] = taskRes.tasks || [];
        listTasks.forEach((t) => {
          tasks.push({
            id: t.id,
            name: t.name,
            status: t.status,
            orderindex: t.orderindex,
            date_created: t.date_created,
            date_updated: t.date_updated,
            creator: t.creator,
            assignees: t.assignees,
            list: t.list || { id: l.id, name: l.name },
            folder: t.folder,
            space: t.space,
            url: t.url,
            description: t.text_content || t.description,
            priority: t.priority,
            custom_fields: t.custom_fields
          });
        });
      } catch (err) {
        console.warn(`Could not fetch tasks for ClickUp list ${l.id}:`, err);
      }
    })
  );

  return {
    space: spaceData,
    folders,
    lists: allLists,
    tasks,
    fetchedAt: new Date().toISOString(),
    isLive: true
  };
}
