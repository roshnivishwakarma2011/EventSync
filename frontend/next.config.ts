import type { NextConfig } from "next";

// The browser talks to /flask/* on this site; Next forwards it to the Flask backend (no CORS setup needed).
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: "/flask/:path*", destination: `${BACKEND_URL}/:path*` }];
  },
};

export default nextConfig;
