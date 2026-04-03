#!/bin/bash
# Electron 开发模式启动脚本

# 取消 ELECTRON_RUN_AS_NODE 环境变量
unset ELECTRON_RUN_AS_NODE

# 设置开发模式
export NODE_ENV=development

# 启动 Electron
cd "$(dirname "$0")"
./node_modules/electron/dist/electron.exe .
