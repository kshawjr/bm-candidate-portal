/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Force a unique build ID per commit so Vercel can never serve stale JS
  // chunks from a prior deploy when its build cache restores. Next.js
  // embeds the build ID in chunk filenames; tying it to VERCEL_GIT_COMMIT_SHA
  // means each commit produces a fresh chunk URL space, even if the
  // platform restores .next/ from a previous deployment. Locally and in
  // CI without Vercel's env, we fall back to a per-build timestamp so we
  // still get fresh IDs on every `next build`.
  generateBuildId: async () => {
    return process.env.VERCEL_GIT_COMMIT_SHA || `build-${Date.now()}`;
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "dcnbgzxfhsrgmcfwydyy.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: "placehold.co",
      },
    ],
  },
};

export default nextConfig;
