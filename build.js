#!/usr/bin/env node
/**
 * 打包脚本 - 将 TypeScript 项目编译并打包成 exe
 */
import { execSync } from 'child_process';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

console.log('🦞 开始打包小龙虾 AI...\n');

// 1. 清理旧的构建
console.log('📦 清理旧构建...');
if (existsSync('dist')) {
  rmSync('dist', { recursive: true, force: true });
}
if (existsSync('release')) {
  rmSync('release', { recursive: true, force: true });
}

// 2. 编译 TypeScript
console.log('\n🔨 编译 TypeScript...');
try {
  execSync('npx tsc', { stdio: 'inherit' });
  console.log('✅ TypeScript 编译完成');
} catch (error) {
  console.error('❌ TypeScript 编译失败');
  process.exit(1);
}

// 3. 创建 release 目录
if (!existsSync('release')) {
  mkdirSync('release', { recursive: true });
}

// 4. 使用 pkg 打包
console.log('\n📦 打包成 exe...');
try {
  // 打包 GUI 版本
  console.log('打包 GUI 版本...');
  execSync(
    'npx pkg gui-wrapper.js --targets node18-win-x64 --output release/xiaolongxia-ai-gui.exe --compress GZip',
    { stdio: 'inherit' }
  );

  // 打包命令行版本
  console.log('打包命令行版本...');
  execSync(
    'npx pkg cli-wrapper.js --targets node18-win-x64 --output release/xiaolongxia-ai.exe --compress GZip',
    { stdio: 'inherit' }
  );

  console.log('✅ 打包完成!');
} catch (error) {
  console.error('❌ 打包失败');
  process.exit(1);
}

console.log('\n🎉 打包成功! exe 文件位于: release/xiaolongxia-ai.exe');
console.log('\n使用方法:');
console.log('  1. 复制 .env.example 为 .env 并配置 API Key');
console.log('  2. 运行: xiaolongxia-ai.exe "你的指令"');
