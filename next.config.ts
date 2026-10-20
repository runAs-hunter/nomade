import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // nomadevisa.com fake-door landing: static files in public/landing, served at /.
  // The previous locked waitlist page stays reachable at /waitlist.
  async rewrites() {
    return {
      beforeFiles: [{ source: "/", destination: "/landing/index.html" }],
    };
  },
};

export default nextConfig;
