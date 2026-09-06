import type { StatusMap, Streamer } from "./stream-types";

const STREAMERS_KEY = "stream_notifier_v6";
const STATUS_KEY = "stream_notifier_status_v6";
const AUTO_KEY = "stream_notifier_auto_v6";

function getStorage(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadStreamers(): Streamer[] {
  try {
    const raw = getStorage()?.getItem(STREAMERS_KEY);
    return raw ? (JSON.parse(raw) as Streamer[]) : [];
  } catch {
    return [];
  }
}

export function loadStatus(): StatusMap {
  try {
    const raw = getStorage()?.getItem(STATUS_KEY);
    return raw ? (JSON.parse(raw) as StatusMap) : {};
  } catch {
    return {};
  }
}

export function loadAuto(): boolean {
  try {
    return getStorage()?.getItem(AUTO_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveAll(streamers: Streamer[], status: StatusMap, auto: boolean) {
  try {
    const storage = getStorage();
    if (!storage) return;
    storage.setItem(STREAMERS_KEY, JSON.stringify(streamers));
    storage.setItem(STATUS_KEY, JSON.stringify(status));
    storage.setItem(AUTO_KEY, auto ? "1" : "0");
  } catch {
    // Storage can be unavailable in restricted/private WebViews. The UI keeps working.
  }
}
