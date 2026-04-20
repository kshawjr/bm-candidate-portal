"use client";

import { useRouter, useSearchParams } from "next/navigation";

export interface AdminBrand {
  id: string;
  slug: string;
  name: string;
}

interface Props {
  brands: AdminBrand[];
  selectedSlug: string;
}

export function BrandSelector({ brands, selectedSlug }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleChange = (slug: string) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("brand", slug);
    router.push(`?${params.toString()}`);
  };

  if (brands.length === 0) {
    return (
      <p className="admin-muted">No brands found in bmave-core.brands.</p>
    );
  }

  return (
    <div className="admin-brand-pills" role="radiogroup" aria-label="Brand">
      {brands.map((b) => {
        const active = b.slug === selectedSlug;
        return (
          <button
            key={b.slug}
            type="button"
            role="radio"
            aria-checked={active}
            className={`admin-brand-pill${active ? " active" : ""}`}
            onClick={() => handleChange(b.slug)}
          >
            {b.name}
          </button>
        );
      })}
    </div>
  );
}
