import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep sharp and the Apify client out of the bundler; they run on the Node.js runtime.
  serverExternalPackages: ["sharp", "apify-client"],
  // Tailwind v4 is compiled by the Turbopack loader (no PostCSS config needed).
  turbopack: {
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
  async headers() {
    // The demo features real public figures in a simulated dating context:
    // keep every page out of search engines.
    return [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }];
  },
};

export default nextConfig;
