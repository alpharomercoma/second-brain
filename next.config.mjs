/** @type {import('next').NextConfig} */
const nextConfig = {
  // The chat route streams for a while as the agent runs multiple tool steps.
  // Vercel functions: bump maxDuration in the route itself (export const maxDuration).
  experimental: {},
};

export default nextConfig;
