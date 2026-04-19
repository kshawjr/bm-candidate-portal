import { notFound } from "next/navigation";
import { createAppServiceClient } from "@/lib/supabase-app";
import { createCoreClient } from "@/lib/core-client";

export const dynamic = "force-dynamic";

export default async function PortalTokenPage({
  params,
}: {
  params: { token: string };
}) {
  const app = createAppServiceClient();
  const { data: session } = await app
    .from("candidates_in_portal")
    .select("id, candidate_id")
    .eq("token", params.token)
    .maybeSingle();

  if (!session) notFound();

  const core = createCoreClient();
  const { data: candidate } = await core
    .from("candidates")
    .select("first_name, brand_id")
    .eq("id", session.candidate_id)
    .maybeSingle();

  if (!candidate) notFound();

  const { data: brand } = await core
    .from("brands")
    .select("name")
    .eq("id", candidate.brand_id)
    .maybeSingle();

  if (!brand) notFound();

  return (
    <main className="p-12">
      <h1 className="text-3xl font-semibold">
        Hello {candidate.first_name}, welcome to {brand.name}
      </h1>
    </main>
  );
}
