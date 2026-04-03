#!/usr/bin/env node
// 启动 Electron 开发模式，确保清除 ELECTRON_RUN_AS_NODE 避免 VS Code 终端继承问题
const { spawn } = require('child_process');
const path = require('path');

const electronPath = require('./node_modules/electron');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
env.NODE_ENV = 'development';

const child = spawn(electronPath, ['.'], {
  stdio: 'inherit',
  env,
  cwd: __dirname,
});

child.on('close', (code) => process.exit(code ?? 0));
