import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // F12 0.5: Studio SAMPLE files are served only by the gated route, so they
  // live outside public/ and must be traced into that function's bundle.
  outputFileTracingIncludes: {
    "/api/waitlist/sample/[source]/[asset]": ["./private/waitlist-samples/**/*"],
    "/waitlist/thanks": ["./private/waitlist-samples/**/*"],
  },
};

export default nextConfig;
