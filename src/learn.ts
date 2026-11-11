/**
 * What the reader has done so far, kept in this browser only (localStorage): the pages they have read to the end, the
 * page they were last on, and the learning path they are following. Nothing is sent anywhere. In private mode, or with
 * storage blocked, everything still works for the visit and is simply not remembered.
 */
const READ = 'bitbang:read', LAST = 'bitbang:last', PATH = 'bitbang:path';

const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k: string, v: string | null) => {
  try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* not remembered */ }
};

const read = new Set<string>((() => {
  try { const v = JSON.parse(get(READ) ?? '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; } catch { return []; }
})());
let last = get(LAST), path = get(PATH);

const listeners = new Set<() => void>();
const changed = () => listeners.forEach((f) => f());
/** Calls `f` whenever the reader's progress or path changes. */
export const onProgress = (f: () => void) => { listeners.add(f); };

export const isRead = (id: string) => read.has(id);
export const readCount = (ids: string[]) => ids.filter(isRead).length;
export const anyRead = () => read.size > 0;
export function markRead(id: string) {
  if (read.has(id)) return;
  read.add(id);
  set(READ, JSON.stringify([...read]));
  changed();
}

/** The page the reader was last on, to offer on the home page. */
export const lastPage = () => last;
export function setLastPage(id: string) { last = id; set(LAST, id); }

/** The learning path being followed, by id, or null. */
export const activePath = () => path;
export function setActivePath(id: string | null) {
  if (path === id) return;
  path = id;
  set(PATH, id);
  changed();
}

/** Forgets everything: read pages, the last page and the path. */
export function resetProgress() {
  read.clear();
  last = path = null;
  for (const k of [READ, LAST, PATH]) set(k, null);
  changed();
}
