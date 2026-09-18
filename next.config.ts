import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // proxy.ts buffers every request body (to check the auth cookie) up to
    // this limit before truncating it — default is 10MB, too small for
    // multi-page invoice PDFs. Keep this above MAX_FILE_BYTES in
    // app/api/invoices/upload/route.ts.
    proxyClientMaxBodySize: "25mb",
  },
};

export default nextConfig;
