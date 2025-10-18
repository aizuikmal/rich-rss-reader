/** @type {import('next').NextConfig} */
const nextConfig = {
  // Tell Next to produce a fully static build in ./out
  output: 'export',
  // Required for static export if you use <Image> or remote images
  images: { unoptimized: true },
};

module.exports = nextConfig;
