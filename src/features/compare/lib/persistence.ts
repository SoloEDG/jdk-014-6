import type { CompareSession } from "../model/types";

const PREFIX = "panel-compare-v1";

function key(originalId: string, redraftId: string) {
  return `${PREFIX}:${originalId}::${redraftId}`;
}

/** 两份原稿都完整保留：会话里同时存档 original 与 redraft */
export function saveCompareSession(session: CompareSession): boolean {
  try {
    localStorage.setItem(
      key(session.original.id, session.redraft.id),
      JSON.stringify(session),
    );
    return true;
  } catch {
    return false;
  }
}

export function loadCompareSession(
  originalId: string,
  redraftId: string,
): CompareSession | null {
  try {
    const raw = localStorage.getItem(key(originalId, redraftId));
    if (!raw) return null;
    const value = JSON.parse(raw) as CompareSession;
    if (!Array.isArray(value.links) || !value.original || !value.redraft)
      return null;
    return value;
  } catch {
    return null;
  }
}
