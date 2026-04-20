"use client";

import { useRouter } from "next/navigation";

// Hardcoded dev tokens. If you spin up more test candidates, add them here.
const TOKENS = [
  { code: "HT", label: "Hounds Town", token: "test-token-123" },
  { code: "CT", label: "Cruisin' Tikis", token: "test-token-456" },
] as const;

interface Props {
  currentToken: string;
}

export function DevBrandSwitcher({ currentToken }: Props) {
  const router = useRouter();
  const current =
    TOKENS.find((t) => t.token === currentToken) ?? TOKENS[0];
  const other =
    TOKENS.find((t) => t.token !== current.token) ?? TOKENS[1];

  return (
    <div className="dev-switcher" aria-label="Dev brand switcher">
      <span className="dev-switcher-label">dev</span>
      <span className="dev-switcher-current" title={current.label}>
        {current.code}
      </span>
      <button
        type="button"
        className="dev-switcher-btn"
        onClick={() => router.push(`/portal/${other.token}`)}
        title={`Switch to ${other.label}`}
      >
        → {other.code}
      </button>
    </div>
  );
}
