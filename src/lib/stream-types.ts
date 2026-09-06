export type Platform = "twitch" | "kick";

export type Streamer = {
  platform: Platform;
  username: string;
};

export type StreamStatus = {
  isLive: boolean | null;
  error?: boolean;
  title?: string;
  game?: string;
  viewers?: number | null;
  startedAt?: string | null;
  avatar?: string;
  verified?: boolean;
  url?: string;
  lastLiveAt?: string | null;
};

export type StatusMap = Record<string, StreamStatus>;

export function streamerKey(s: Streamer) {
  return `${s.platform}:${s.username}`;
}

export function defaultAvatar(platform: Platform) {
  return platform === "twitch"
    ? "https://static-cdn.jtvnw.net/jtv_user_pictures/xarth/404_user_70x70.png"
    : "https://kick.com/img/default-profile-pictures/default2.jpeg";
}

export function profileUrl(s: Streamer) {
  return s.platform === "twitch"
    ? `https://twitch.tv/${s.username}`
    : `https://kick.com/${s.username}`;
}

export function formatNumber(n: number | null | undefined) {
  if (n == null) return "";
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

export function formatUptime(startedAt?: string | null) {
  if (!startedAt) return "";
  const start = new Date(startedAt).getTime();
  if (Number.isNaN(start)) return "";
  const diff = Math.max(0, Date.now() - start);
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function formatTimeAgo(timestamp?: string | null) {
  if (!timestamp) return "";
  const then = new Date(timestamp).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Math.max(0, Date.now() - then);
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (mins < 1) return "hace un momento";
  if (mins < 60) return `hace ${mins} min`;
  if (hours < 24) return `hace ${hours}h`;
  if (days === 1) return "hace 1 dia";
  if (days < 30) return `hace ${days} dias`;
  return `hace ${Math.floor(days / 30)} mes`;
}
