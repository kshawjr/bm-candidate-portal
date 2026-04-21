"use client";

export type VideoSource = "youtube" | "vimeo" | "upload";

export interface VideoConfig {
  source: VideoSource;
  url: string;
  title?: string;
  body?: string;
  cta_label?: string;
}

interface Props {
  config: VideoConfig;
  onComplete: () => void;
  completeDisabled?: boolean;
  isCompleted?: boolean;
}

function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") return u.pathname.replace("/", "") || null;
    if (u.hostname.includes("youtube.com")) {
      if (u.pathname.startsWith("/embed/")) {
        return u.pathname.split("/embed/")[1]?.split("/")[0] ?? null;
      }
      if (u.pathname.startsWith("/shorts/")) {
        return u.pathname.split("/shorts/")[1]?.split("/")[0] ?? null;
      }
      return u.searchParams.get("v");
    }
  } catch {
    // fall through — URL didn't parse
  }
  return null;
}

function extractVimeoId(url: string): string | null {
  if (!url) return null;
  const match = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  return match?.[1] ?? null;
}

export function VideoRenderer({
  config,
  onComplete,
  completeDisabled,
  isCompleted,
}: Props) {
  const { source, url, title, body, cta_label } = config;

  if (!url) {
    return (
      <div className="cine-placeholder">
        <div className="cine-placeholder-icon">🎬</div>
        <h4>No video configured</h4>
        <p>
          Add a video URL in the admin at{" "}
          <code>steps_config.config.url</code>.
        </p>
      </div>
    );
  }

  let playerEl: React.ReactNode;
  if (source === "youtube") {
    const id = extractYouTubeId(url);
    if (!id) {
      playerEl = <BadUrlMessage url={url} expected="YouTube" />;
    } else {
      playerEl = (
        <iframe
          className="video-frame"
          src={`https://www.youtube.com/embed/${id}?rel=0&modestbranding=1`}
          title={title || "Video"}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          loading="lazy"
        />
      );
    }
  } else if (source === "vimeo") {
    const id = extractVimeoId(url);
    if (!id) {
      playerEl = <BadUrlMessage url={url} expected="Vimeo" />;
    } else {
      playerEl = (
        <iframe
          className="video-frame"
          src={`https://player.vimeo.com/video/${id}`}
          title={title || "Video"}
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          loading="lazy"
        />
      );
    }
  } else {
    // 'upload' — direct video URL
    playerEl = (
      <video className="video-frame" controls preload="metadata" src={url}>
        Your browser doesn&apos;t support video playback.
      </video>
    );
  }

  return (
    <div className="video-renderer">
      {title && <h3 className="video-title">{title}</h3>}
      <div className="video-canvas">{playerEl}</div>
      {body && <p className="video-body">{body}</p>}
      <div className="video-controls">
        <button
          type="button"
          className="slide-nav-btn primary"
          onClick={onComplete}
          disabled={completeDisabled}
        >
          {isCompleted ? "Continue →" : cta_label?.trim() || "Continue →"}
        </button>
      </div>
    </div>
  );
}

function BadUrlMessage({ url, expected }: { url: string; expected: string }) {
  return (
    <div className="cine-placeholder">
      <div className="cine-placeholder-icon">⚠️</div>
      <h4>Couldn&apos;t parse the {expected} URL</h4>
      <p>
        <code>{url}</code>
      </p>
    </div>
  );
}
