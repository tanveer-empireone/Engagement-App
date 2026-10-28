/**
 * ClickUp Live Read Service
 * STRICTLY READ-ONLY: All API requests use HTTP GET. No task creation, update, or deletion.
 * Uses Vite proxy (/api/clickup/...) to prevent browser CORS blocks.
 */

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

const STORAGE_KEY_CLICKUP_TOKEN = 'e1_clickup_api_token';

export function getStoredClickUpToken(): string {
  try {
    return (
      localStorage.getItem(STORAGE_KEY_CLICKUP_TOKEN) ||
      (import.meta.env.VITE_CLICKUP_API_TOKEN as string) ||
      ''
    );
  } catch {
    return (import.meta.env.VITE_CLICKUP_API_TOKEN as string) || '';
  }
}

export function saveStoredClickUpToken(token: string): void {
  try {
    localStorage.setItem(STORAGE_KEY_CLICKUP_TOKEN, token.trim());
  } catch {}
}

/**
 * Execute HTTP GET through the Vite proxy or direct ClickUp endpoint
 */
async function clickUpGet(path: string, token: string): Promise<any> {
  // Use local Vite proxy route first to avoid browser CORS restrictions
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const proxyUrl = `/api/clickup${cleanPath}`;

  const headers: HeadersInit = {
    Authorization: token.trim(),
    'Content-Type': 'application/json'
  };

  try {
    const res = await fetch(proxyUrl, {
      method: 'GET',
      headers
    });

    if (res.ok) {
      return await res.json();
    }

    // If proxy returned 404 or failed, try direct ClickUp API endpoint
    if (res.status === 404 || res.status === 502) {
      const directUrl = `https://api.clickup.com/api/v2${cleanPath}`;
      const directRes = await fetch(directUrl, {
        method: 'GET',
        headers
      });
      if (directRes.ok) {
        return await directRes.json();
      }
      const err = await directRes.text();
      throw new Error(`ClickUp API returned ${directRes.status}: ${err}`);
    }

    const err = await res.text();
    throw new Error(`ClickUp API returned ${res.status}: ${err}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`ClickUp request failed: ${msg}`);
  }
}

/**
 * Test ClickUp token against the target Engagement space (HTTP GET only)
 */
export async function testClickUpConnection(
  token: string,
  spaceId: string = CLICKUP_ENGAGEMENT_SPACE_ID
): Promise<{ success: boolean; message: string; space?: any }> {
  if (!token || !token.trim()) {
    return { success: false, message: 'Please enter your ClickUp Personal API Token (pk_...)' };
  }

  try {
    const data = await clickUpGet(`/space/${spaceId}`, token);
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
  token: string,
  spaceId: string = CLICKUP_ENGAGEMENT_SPACE_ID
): Promise<LiveClickUpResult> {
  if (!token || !token.trim()) {
    throw new Error('ClickUp API token is required to fetch live tasks');
  }

  // 1. Fetch space details
  const spaceData = await clickUpGet(`/space/${spaceId}`, token).catch(() => null);

  // 2. Fetch folders inside space
  const foldersRes = await clickUpGet(`/space/${spaceId}/folder`, token).catch(() => ({ folders: [] }));
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
  const listsRes = await clickUpGet(`/space/${spaceId}/list`, token).catch(() => ({ lists: [] }));
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
        const taskRes = await clickUpGet(`/list/${l.id}/task?subtasks=true&include_closed=true`, token);
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
