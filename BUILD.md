# 打包说明

## 打包步骤

### 1. 安装依赖

```bash
cd C:\Users\14471\Documents\GitHub\xiaolongxia-ai02\xiaolongxia-ai
npm install
```

### 2. 执行打包

```bash
npm run pkg
```

打包过程会：
1. 清理旧的构建文件
2. 编译 TypeScript 代码到 `dist/` 目录
3. 使用 pkg 将代码打包成 Windows exe
4. 输出文件到 `release/xiaolongxia-ai.exe`

### 3. 使用打包后的程序

```bash
# 1. 配置环境变量
copy .env.example .env
# 编辑 .env 文件，填入你的 API Key

# 2. 运行程序
cd release
xiaolongxia-ai.exe "帮我分析无线耳机市场并写英文文案"
```

## 注意事项

1. **环境变量**: exe 文件需要在同目录下有 `.env` 文件，或者设置系统环境变量 `OPENAI_API_KEY` 或 `SILICONFLOW_API_KEY`

2. **依赖项**: pkg 会将 Node.js 运行时和所有依赖打包进 exe，文件大小约 50-100MB

3. **网络访问**: 程序需要访问 OpenAI 或 SiliconFlow API，确保网络畅通

4. **Windows Defender**: 首次运行可能被 Windows Defender 拦截，需要添加信任

## 分发

打包后的文件在 `release/` 目录：
- `xiaolongxia-ai.exe` - 主程序
- `.env.example` - 配置模板（需要用户自己填写 API Key）

可以将这两个文件打包成 zip 分发给其他用户。

## 故障排查

### 打包失败

如果遇到 `pkg` 打包失败，可能是因为：
1. TypeScript 编译错误 - 检查 `npm run build` 是否成功
2. 依赖项问题 - 确保 `node_modules` 完整安装
3. 路径问题 - 确保在项目根目录执行命令

### 运行失败

如果 exe 运行失败：
1. 检查 `.env` 文件是否存在且配置正确
2. 检查网络连接
3. 查看错误信息，可能是 API Key 无效或配额不足
