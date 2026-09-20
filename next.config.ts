import type { NextConfig } from "next";

// No experimental.proxyClientMaxBodySize override needed: since Phase 7,
// no route receives a raw file body directly — uploads go straight from
// the client to Supabase Storage via a signed URL (see "What's built
// (Phase 7)" in the README), so every request body proxy.ts buffers is
// small JSON, well under Next's default limit.
const nextConfig: NextConfig = {};

export default nextConfig;
