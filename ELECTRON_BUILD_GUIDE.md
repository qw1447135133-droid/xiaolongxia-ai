# 小龙虾 AI 团队 - Electron 打包指南

## 问题诊断
打包失败原因：无法从 GitHub 下载 Electron 运行时（v30.0.0）

## 解决方案

### 方案 1：使用国内镜像（推荐）

在项目根目录创建 `.npmrc` 文件，添加以下内容：

```
electron_mirror=https://npmmirror.com/mirrors/electron/
electron_builder_binaries_mirror=https://npmmirror.com/mirrors/electron-builder-binaries/
```

然后重新运行：
```bash
npm run electron:build
```

### 方案 2：手动下载 Electron

1. 从淘宝镜像下载 Electron：
   https://npmmirror.com/mirrors/electron/30.0.0/electron-v30.0.0-win32-x64.zip

2. 将下载的文件放到缓存目录：
   `%LOCALAPPDATA%\electron\Cache\`

3. 重新运行打包命令

### 方案 3：使用代理

如果有代理，设置环境变量：
```bash
set HTTPS_PROXY=http://your-proxy:port
npm run electron:build
```

### 方案 4：使用已安装的 Electron

如果 node_modules 中已有 Electron，可以配置使用本地版本。

修改 package.json 的 build 配置：
```json
"build": {
  "electronDist": "node_modules/electron/dist",
  ...
}
```

## 快速修复脚本

运行以下 PowerShell 命令：

```powershell
# 设置镜像
npm config set electron_mirror https://npmmirror.com/mirrors/electron/
npm config set electron_builder_binaries_mirror https://npmmirror.com/mirrors/electron-builder-binaries/

# 重新打包
cd C:\Users\14471\Documents\GitHub\xiaolongxia-ai02\xiaolongxia-ai\apps\web
npm run electron:build
```

## 打包成功后

打包完成后，可执行文件将位于：
- 安装程序：`dist-electron\小龙虾AI团队 Setup 0.1.0.exe`
- 免安装版：`dist-electron\win-unpacked\小龙虾AI团队.exe`

## 注意事项

1. 首次打包需要下载约 100MB 的 Electron 运行时
2. 打包过程需要 5-10 分钟
3. 最终安装包大小约 150-200MB
