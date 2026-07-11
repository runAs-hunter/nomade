/**
 * localStorage persistence layer.
 *
 * Schema:
 * {
 *   profile: UserProfile | null,
 *   completedTasks: string[],          — task IDs
 *   quizProgress: { currentStep: number, answers: Record<string, string> } | null,
 *   lastUpdated: string                — ISO 8601
 * }
 */

import type { UserProfile } from "@/data/schema";

const STORAGE_KEY = "nomade_v1";

export type QuizProgress = {
  currentStep: number;
  answers: Record<string, string>;
};

export type StoredState = {
  profile: UserProfile | null;
  completedTasks: string[];
  quizProgress: QuizProgress | null;
  lastUpdated: string;
};

function defaultState(): StoredState {
  return {
    profile: null,
    completedTasks: [],
    quizProgress: null,
    lastUpdated: new Date().toISOString(),
  };
}

export function loadState(): StoredState {
  if (typeof window === "undefined") return defaultState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    return JSON.parse(raw) as StoredState;
  } catch {
    return defaultState();
  }
}

export function saveState(partial: Partial<StoredState>): void {
  if (typeof window === "undefined") return;
  const current = loadState();
  const next: StoredState = {
    ...current,
    ...partial,
    lastUpdated: new Date().toISOString(),
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function clearState(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

// ─── URL share export ────────────────────────────────────────────────────────

/** Encode profile + completed tasks as a base64 URL param. */
export function encodeShareState(
  profile: UserProfile,
  completedTasks: string[]
): string {
  const payload = JSON.stringify({ profile, completedTasks });
  return btoa(payload);
}

/** Decode a share param back to { profile, completedTasks }. Returns null on error. */
export function decodeShareState(
  encoded: string
): { profile: UserProfile; completedTasks: string[] } | null {
  try {
    const json = atob(encoded);
    const parsed = JSON.parse(json);
    if (!parsed.profile || !Array.isArray(parsed.completedTasks)) return null;
    return parsed;
  } catch {
    return null;
  }
}
