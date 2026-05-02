/**
 * Video source parsing for the welcome popup video player.
 *
 * Three providers are supported:
 *   - youtube: any youtube.com/watch?v=, youtu.be, or shorts URL → ID + embed
 *   - vimeo:   any vimeo.com/<id> URL → ID + embed
 *   - mp4:     a direct file URL (anything ending in .mp4, .webm, .mov, or
 *              hosted in our brand-assets storage bucket) → played via <video>
 *
 * Usage:
 *   const parsed = parseVideoSource("https://youtu.be/abc");
 *   if (parsed) renderEmbed(parsed.embedUrl);
 */

export type VideoProvider = "youtube" | "vimeo" | "mp4";

export interface ParsedVideoSource {
  provider: VideoProvider;
  /** For iframe providers, the embeddable URL. For mp4, the original file URL. */
  embedUrl: string;
  /** For iframe providers, the parsed video ID. Undefined for mp4. */
  videoId?: string;
}

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
  "www.youtu.be",
]);

const VIMEO_HOSTS = new Set(["vimeo.com", "www.vimeo.com", "player.vimeo.com"]);

function tryUrl(input: string): URL | null {
  try {
    return new URL(input.trim());
  } catch {
    return null;
  }
}

function parseYouTubeId(url: URL): string | null {
  // youtu.be/<id>
  if (url.hostname.endsWith("youtu.be")) {
    const id = url.pathname.replace(/^\//, "").split("/")[0];
    return id || null;
  }
  // youtube.com/watch?v=<id>
  const v = url.searchParams.get("v");
  if (v) return v;
  // youtube.com/shorts/<id> or /embed/<id> or /v/<id>
  const m = url.pathname.match(/^\/(?:shorts|embed|v)\/([A-Za-z0-9_-]+)/);
  if (m) return m[1];
  return null;
}

function parseVimeoId(url: URL): string | null {
  // vimeo.com/<id>          or vimeo.com/<id>/<hash>
  // player.vimeo.com/video/<id>
  if (url.hostname === "player.vimeo.com") {
    const m = url.pathname.match(/^\/video\/(\d+)/);
    return m ? m[1] : null;
  }
  const m = url.pathname.match(/^\/(\d+)/);
  return m ? m[1] : null;
}

function looksLikeDirectVideo(url: URL): boolean {
  const path = url.pathname.toLowerCase();
  return /\.(mp4|webm|mov|m4v)$/.test(path);
}

export function parseVideoSource(input: string): ParsedVideoSource | null {
  if (!input || typeof input !== "string") return null;
  const url = tryUrl(input);
  if (!url) return null;

  if (YOUTUBE_HOSTS.has(url.hostname)) {
    const videoId = parseYouTubeId(url);
    if (!videoId) return null;
    return {
      provider: "youtube",
      videoId,
      // rel=0 keeps related videos limited to the same channel; modestbranding
      // strips the extra YouTube logo overlay.
      embedUrl: `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`,
    };
  }

  if (VIMEO_HOSTS.has(url.hostname)) {
    const videoId = parseVimeoId(url);
    if (!videoId) return null;
    return {
      provider: "vimeo",
      videoId,
      embedUrl: `https://player.vimeo.com/video/${videoId}`,
    };
  }

  if (looksLikeDirectVideo(url)) {
    return { provider: "mp4", embedUrl: url.toString() };
  }

  return null;
}

/**
 * Best-effort provider detection from a URL string. Returns null if the URL
 * doesn't match any known pattern. Used by the admin editor to auto-fill the
 * provider dropdown when an admin pastes a URL.
 */
export function detectVideoProvider(input: string): VideoProvider | null {
  const parsed = parseVideoSource(input);
  return parsed ? parsed.provider : null;
}
