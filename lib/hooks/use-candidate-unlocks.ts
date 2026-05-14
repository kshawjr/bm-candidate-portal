"use client";

import { useEffect, useState } from "react";
import { createAppAnonClient } from "@/lib/supabase-app";

interface UseCandidateUnlocksResult {
  unlocks: string[];
  loading: boolean;
}

/**
 * Subscribe to a candidate's unlocked_keys array on candidates_in_portal
 * and return the live value as a string[].
 *
 * Behavior:
 *   - When `initialKeys` is provided (e.g. from the SSR render of
 *     candidates_in_portal.unlocked_keys), state seeds from it
 *     synchronously so there's no flash from [] → real value while the
 *     fetch and subscription connect.
 *   - On mount, opens a Supabase realtime channel
 *     (`candidate-unlocks-${candidateId}`) filtered on
 *     `candidate_id=eq.${candidateId}` and updates state on every UPDATE.
 *   - Cleans up the channel on unmount.
 *
 * Reuses the portal anon client (createAppAnonClient) — no separate
 * realtime client needed. Multiple consumers calling this with the same
 * candidateId open independent channels; Supabase server-side dedupes
 * channel names within a client, but separate client instances do not
 * share. A CandidateUnlocksProvider with React Context is the cleanup
 * path if this becomes a perf concern; out of scope for now.
 *
 * Pass `null` for `candidateId` to disable (no fetch, no subscription).
 * Useful for admin previews where there's no live candidate context.
 */
export function useCandidateUnlocks(
  candidateId: string | null,
  initialKeys: string[] = [],
): UseCandidateUnlocksResult {
  const [unlocks, setUnlocks] = useState<string[]>(initialKeys);
  const [loading, setLoading] = useState(candidateId !== null);

  useEffect(() => {
    if (!candidateId) {
      setLoading(false);
      return;
    }

    const supabase = createAppAnonClient();
    let cancelled = false;

    // Initial fetch — confirms the SSR snapshot is still current. The
    // window between server render and client subscription is small but
    // not zero; if an update slipped through, this pulls it in.
    supabase
      .from("candidates_in_portal")
      .select("unlocked_keys")
      .eq("candidate_id", candidateId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const keys = Array.isArray(data?.unlocked_keys)
          ? (data!.unlocked_keys as string[])
          : [];
        setUnlocks(keys);
        setLoading(false);
      });

    const channel = supabase
      .channel(`candidate-unlocks-${candidateId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "candidates_in_portal",
          filter: `candidate_id=eq.${candidateId}`,
        },
        (payload) => {
          const incoming = payload.new as { unlocked_keys?: unknown };
          const keys = Array.isArray(incoming.unlocked_keys)
            ? (incoming.unlocked_keys as string[])
            : [];
          setUnlocks(keys);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [candidateId]);

  return { unlocks, loading };
}
