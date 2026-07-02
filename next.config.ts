import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle (.next/standalone) so the Docker runtime
  // stage needs only node + the traced deps — no pnpm/full node_modules (§9 infra).
  output: 'standalone',
};

export default nextConfig;
