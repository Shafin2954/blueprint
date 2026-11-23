import type { NextConfig } from "next";

// Everything runs in the browser (no API routes), so ship plain static files.
// BASE_PATH is set when hosting under a sub-path, e.g. GitHub Pages at /<repo>.
const basePath = process.env.BASE_PATH?.replace(/\/$/, "") || undefined;

const nextConfig: NextConfig = {
  output: "export",
  basePath,
};

export default nextConfig;
