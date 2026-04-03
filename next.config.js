/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 仅在 Electron 打包时启用静态导出
  ...(process.env.ELECTRON_BUILD === 'true' && {
    output: 'export',
    distDir: 'out',
    assetPrefix: './',
    images: {
      unoptimized: true,
    },
  }),
  // 开发模式下将 /api/* 代理到 ws-server
  ...(process.env.ELECTRON_BUILD !== 'true' && {
    async rewrites() {
      return [
        {
          source: '/api/:path*',
          destination: `http://localhost:${process.env.WS_PORT || 3001}/api/:path*`,
        },
      ];
    },
  }),
};
module.exports = nextConfig;
