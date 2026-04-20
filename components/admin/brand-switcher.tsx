"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export interface AdminSwitcherBrand {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
}

interface Props {
  brands: AdminSwitcherBrand[];
}

export function AdminBrandSwitcher({ brands }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const urlSlug = searchParams?.get("brand") ?? null;
  const selected =
    (urlSlug && brands.find((b) => b.slug === urlSlug)) ||
    brands[0] ||
    null;

  // Close on outside click + Escape.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selectBrand = (slug: string) => {
    // Preserve any other search params already on the URL. Strip step when
    // changing brand — step IDs are brand-scoped and don't transfer.
    const params = new URLSearchParams(
      Array.from(searchParams?.entries() ?? []),
    );
    params.set("brand", slug);
    params.delete("step");
    router.push(`?${params.toString()}`);
    router.refresh();
    setOpen(false);
  };

  if (brands.length === 0) {
    return (
      <div className="admin-brand-switcher admin-brand-switcher-empty">
        No brands
      </div>
    );
  }

  return (
    <div className="admin-brand-switcher" ref={rootRef}>
      <button
        type="button"
        className="admin-brand-switcher-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {selected?.logo_url ? (
          <span className="admin-brand-switcher-logo">
            <Image
              src={selected.logo_url}
              alt=""
              width={120}
              height={40}
              unoptimized
            />
          </span>
        ) : (
          <span className="admin-brand-switcher-logo-placeholder" aria-hidden>
            {selected?.name?.charAt(0).toUpperCase() ?? "?"}
          </span>
        )}
        <span className="admin-brand-switcher-name">
          {selected?.name ?? "Select a brand"}
        </span>
        <ChevronDown open={open} />
      </button>

      {open && (
        <div className="admin-brand-switcher-menu" role="listbox">
          {brands.map((b) => {
            const isActive = b.slug === selected?.slug;
            return (
              <button
                key={b.slug}
                type="button"
                role="option"
                aria-selected={isActive}
                className={`admin-brand-switcher-item${isActive ? " active" : ""}`}
                onClick={() => selectBrand(b.slug)}
              >
                {b.logo_url ? (
                  <span className="admin-brand-switcher-logo">
                    <Image
                      src={b.logo_url}
                      alt=""
                      width={120}
                      height={40}
                      unoptimized
                    />
                  </span>
                ) : (
                  <span
                    className="admin-brand-switcher-logo-placeholder"
                    aria-hidden
                  >
                    {b.name.charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="admin-brand-switcher-item-name">{b.name}</span>
                {isActive && <CheckIcon />}
              </button>
            );
          })}
          <div className="admin-brand-switcher-foot">
            <Link
              href="#"
              className="admin-brand-switcher-footlink"
              aria-disabled="true"
              onClick={(e) => e.preventDefault()}
            >
              Manage brands <small>soon</small>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function ChevronDown({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}
      aria-hidden
    >
      <polyline points="2,4 5,7 8,4" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="#3b82f6"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 8l3.5 3.5L13 5" />
    </svg>
  );
}
