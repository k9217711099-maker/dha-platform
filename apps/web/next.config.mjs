/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Транспилируем workspace-пакеты (исходники TS/TSX)
  transpilePackages: ['@dha/ui', '@dha/domain'],
};

export default nextConfig;
