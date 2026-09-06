import type { StreamStatus, Streamer } from "./stream-types";
import { defaultAvatar } from "./stream-types";

// Twitch Client IDs are public by design and may be embedded in browser apps.
// Replace this with a Client ID registered for your own Stream Ocations app.
const TWITCH_CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko";

type TwitchResponse = {
  data?: {
    user?: {
      profileImageURL?: string;
      roles?: { isPartner?: boolean; isAffiliate?: boolean };
      stream?: {
        title?: string;
        viewersCount?: number;
        createdAt?: string;
        game?: { name?: string };
      } | null;
    } | null;
  };
};

type KickResponse = {
  livestream?: {
    is_live?: boolean;
    id?: string | number;
    session_title?: string;
    title?: string;
    viewer_count?: number;
    created_at?: string;
    start_time?: string;
    categories?: { name?: string }[];
    category?: { name?: string };
  } | null;
  recent_categories?: { name?: string }[];
  user?: { profile_pic?: string; verified?: boolean };
  thumbnail?: { url?: string };
  verified?: boolean;
  is_verified?: boolean;
};

function cleanName(username: string) {
  return username.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 40);
}

async function checkTwitch(username: string): Promise<StreamStatus> {
  const login = cleanName(username);
  if (!login) return { isLive: null, error: true };

  try {
    const res = await fetch("https://gql.twitch.tv/gql", {
      method: "POST",
      headers: {
        "Client-ID": TWITCH_CLIENT_ID,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `query ($login: String!) {
          user(login: $login) {
            profileImageURL(width: 150)
            roles { isPartner isAffiliate }
            stream {
              title
              viewersCount
              createdAt
              game { name }
            }
          }
        }`,
        variables: { login },
      }),
    });

    if (!res.ok) return { isLive: null, error: true };
    const data = (await res.json()) as TwitchResponse;
    const user = data.data?.user;

    if (!user) {
      return {
        isLive: false,
        avatar: defaultAvatar("twitch"),
        verified: false,
        url: `https://twitch.tv/${login}`,
      };
    }

    const stream = user.stream;
    return {
      isLive: Boolean(stream),
      title: stream?.title || "",
      game: stream?.game?.name || "",
      viewers: stream?.viewersCount ?? null,
      startedAt: stream?.createdAt || null,
      avatar: user.profileImageURL || defaultAvatar("twitch"),
      verified: Boolean(user.roles?.isPartner || user.roles?.isAffiliate),
      url: `https://twitch.tv/${login}`,
    };
  } catch {
    return { isLive: null, error: true };
  }
}

async function checkKick(username: string): Promise<StreamStatus> {
  const slug = cleanName(username);
  if (!slug) return { isLive: null, error: true };

  const encoded = encodeURIComponent(slug);
  // These are Kick web endpoints rather than the official public API.
  // They may change or reject browser requests (CORS/Cloudflare).
  const endpoints = [
    `https://kick.com/api/v2/channels/${encoded}`,
    `https://kick.com/api/v1/channels/${encoded}`,
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) continue;
      const data = (await res.json()) as KickResponse;
      const live = data.livestream;
      const isLive = Boolean(live && (live.is_live === true || live.id));

      let game = "";
      if (live?.categories?.[0]?.name) game = live.categories[0].name;
      else if (live?.category?.name) game = live.category.name;
      else if (data.recent_categories?.[0]?.name) game = data.recent_categories[0].name;

      return {
        isLive,
        title: live?.session_title || live?.title || "",
        game,
        viewers: live?.viewer_count ?? null,
        startedAt: live?.created_at || live?.start_time || null,
        avatar: data.user?.profile_pic || data.thumbnail?.url || defaultAvatar("kick"),
        verified: Boolean(data.verified || data.user?.verified || data.is_verified),
        url: `https://kick.com/${slug}`,
      };
    } catch {
      // Try the fallback endpoint.
    }
  }

  return { isLive: null, error: true };
}

export async function checkStreamers(streamers: Streamer[]): Promise<Record<string, StreamStatus>> {
  const results: Record<string, StreamStatus> = {};
  await Promise.all(
    streamers.map(async (s) => {
      const key = `${s.platform}:${s.username.toLowerCase()}`;
      results[key] = s.platform === "twitch"
        ? await checkTwitch(s.username)
        : await checkKick(s.username);
    }),
  );
  return results;
}
