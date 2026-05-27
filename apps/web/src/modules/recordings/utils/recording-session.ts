type RecordingSessionPayload = {
  tabId: string;
  recordingId: string;
  updatedAt: number;
};

const SESSION_KEY = 'olshop-recording-session';

function getTabId(): string {
  if (typeof window === 'undefined') return 'server';

  const key = 'olshop-recording-tab-id';
  const existing = sessionStorage.getItem(key);
  if (existing) return existing;

  const tabId = crypto.randomUUID();
  sessionStorage.setItem(key, tabId);
  return tabId;
}

function readSession(): RecordingSessionPayload | null {
  if (typeof window === 'undefined') return null;

  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as RecordingSessionPayload;
  } catch {
    return null;
  }
}

export function setRecordingSession(recordingId: string): void {
  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify({
      tabId: getTabId(),
      recordingId,
      updatedAt: Date.now(),
    }),
  );
}

export function refreshRecordingSession(): void {
  const session = readSession();
  if (!session || session.tabId !== getTabId()) return;

  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...session, updatedAt: Date.now() }));
}

export function clearRecordingSession(): void {
  sessionStorage.removeItem(SESSION_KEY);
}

export function getRecordingSession(): RecordingSessionPayload | null {
  const session = readSession();
  if (!session || session.tabId !== getTabId()) return null;
  return session;
}

export function hasRecordingSessionForCurrentTab(): boolean {
  return getRecordingSession() !== null;
}
