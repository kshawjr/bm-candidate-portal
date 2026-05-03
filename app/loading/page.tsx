"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import "./loading.css";

// Brand slug → portal hostname. Mirrors PORTAL_HOSTS in
// lib/brand-from-hostname.ts (server-only) — duplicated here because
// this page runs on the client and can't import the server module.
// Keep in sync if a third brand comes online.
const PORTAL_HOST_BY_BRAND_SLUG: Record<string, string> = {
  "hounds-town-usa": "houndstowndiscovery.bmave.com",
  "cruisin-tikis": "cruisintikisdiscovery.bmave.com",
};

export default function LoadingPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <LoadingPoll />
    </Suspense>
  );
}

function LoadingFallback() {
  return (
    <main className="loading-page">
      <div className="loading-card">
        <div className="loading-spinner" aria-hidden="true" />
        <h1>Setting up your portal&hellip;</h1>
        <p>Hang tight &mdash; this takes just a moment.</p>
      </div>
    </main>
  );
}

function LoadingPoll() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const email = searchParams.get("email");
  const [attempts, setAttempts] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!email) {
      setError("Missing email parameter");
      return;
    }

    let cancelled = false;

    const pollOnce = async (): Promise<boolean> => {
      try {
        const response = await fetch(
          `/api/candidates/by-email?email=${encodeURIComponent(email)}`,
        );
        if (!response.ok) return false;
        const data = (await response.json()) as {
          found?: boolean;
          token?: string;
          brand_slug?: string;
        };
        if (cancelled) return true;
        if (data.found && data.token && data.brand_slug) {
          const host = PORTAL_HOST_BY_BRAND_SLUG[data.brand_slug];
          if (!host) {
            setError("Unknown brand on candidate record. Contact support.");
            return true;
          }
          router.replace(`https://${host}/portal/${data.token}`);
          return true;
        }
      } catch (err) {
        console.error("[loading] poll error", err);
      }
      return false;
    };

    const interval = setInterval(async () => {
      const done = await pollOnce();
      if (done) {
        clearInterval(interval);
      } else if (!cancelled) {
        setAttempts((prev) => prev + 1);
      }
    }, 2000);

    const timeout = setTimeout(() => {
      clearInterval(interval);
      if (!cancelled) {
        setError(
          "We couldn't set up your portal in time. Check your email for the link, or contact support.",
        );
      }
    }, 60_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [email, router]);

  if (error) {
    return (
      <main className="loading-page">
        <div className="loading-card">
          <h1>Hmm, something didn&rsquo;t go through</h1>
          <p>{error}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="loading-page">
      <div className="loading-card">
        <div className="loading-spinner" aria-hidden="true" />
        <h1>Setting up your portal&hellip;</h1>
        <p>Hang tight &mdash; this takes just a moment.</p>
        {attempts > 5 && (
          <p className="loading-hint">
            This is taking longer than usual. Almost there&hellip;
          </p>
        )}
      </div>
    </main>
  );
}
