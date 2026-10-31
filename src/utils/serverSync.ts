/** Keep mounted sessions current, including after returning to a suspended tab. */
export function subscribeServerState<T>(
  apply: (state: T, initial: boolean) => void,
  onError: (error: unknown) => void,
  events: EventTarget = window,
  visibility: EventTarget = document,
  intervalMs = 5000
): () => void {
  let stopped = false;
  let initial = true;
  let controller: AbortController | undefined;
  let timer: ReturnType<typeof setTimeout>;
  const refresh = async () => {
    clearTimeout(timer);
    controller?.abort();
    const request = new AbortController();
    controller = request;
    try {
      const response = await fetch('/api/state', { cache: 'no-store', signal: request.signal });
      if (!response.ok) throw new Error(`Could not refresh settings (HTTP ${response.status}).`);
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error('Server returned non-JSON response.');
      }
      const state = await response.json();
      if (stopped || request.signal.aborted) return;
      apply(state, initial);
      initial = false;
    } catch (error) {
      if (!stopped && !request.signal.aborted) onError(error);
    } finally {
      if (!stopped && !request.signal.aborted) timer = setTimeout(refresh, intervalMs);
    }
  };
  const onRefresh = () => { void refresh(); };
  events.addEventListener('focus', onRefresh);
  events.addEventListener('online', onRefresh);
  events.addEventListener('app-settings-saved', onRefresh);
  visibility.addEventListener('visibilitychange', onRefresh);
  void refresh();
  return () => {
    stopped = true;
    clearTimeout(timer);
    controller?.abort();
    events.removeEventListener('focus', onRefresh);
    events.removeEventListener('online', onRefresh);
    events.removeEventListener('app-settings-saved', onRefresh);
    visibility.removeEventListener('visibilitychange', onRefresh);
  };
}

export async function saveServerSettings<T>(url: string, method: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });

  const contentType = response.headers.get('content-type') || '';
  let data: any = null;
  if (contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  }

  if (data === null) {
    const text = await response.text().catch(() => '');
    if (!response.ok) {
      if (text.includes('The page c') || text.includes('not found') || response.status === 404) {
        throw new Error(`Server endpoint is temporarily unavailable (HTTP ${response.status}).`);
      }
      throw new Error(`Save failed (HTTP ${response.status})${text ? `: ${text.slice(0, 100)}` : ''}`);
    }
    throw new Error('Server returned an unexpected non-JSON response.');
  }

  if (!response.ok || data.ok === false) {
    throw new Error(data.message || `Save failed (HTTP ${response.status}).`);
  }
  return data as T;
}
