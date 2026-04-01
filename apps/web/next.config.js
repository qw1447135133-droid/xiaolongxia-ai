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
};
module.exports = nextConfig;
