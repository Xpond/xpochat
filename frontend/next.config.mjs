/** @type {import('next').NextConfig} */
const nextConfig = {
  // Remove rewrites - we'll handle API calls through our /api/proxy route instead
  
  // Production optimizations
  compiler: {
    // Remove all console.* calls in production builds
    removeConsole: process.env.NODE_ENV === 'production',
  },
  
  // Additional production optimizations
  poweredByHeader: false, // Remove X-Powered-By header
  reactStrictMode: true,
};

export default nextConfig; 