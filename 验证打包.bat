@echo off
chcp 65001 >nul
cls
echo.
echo ╔════════════════════════════════════════════════════════════╗
echo ║                                                            ║
echo ║          🦞 小龙虾 AI 团队 - 打包验证报告                 ║
echo ║                                                            ║
echo ╚════════════════════════════════════════════════════════════╝
echo.
echo 正在检查打包结果...
echo.

set "DIST_DIR=dist-electron"
set "SETUP_EXE=%DIST_DIR%\小龙虾AI团队 Setup 0.1.0.exe"
set "PORTABLE_EXE=%DIST_DIR%\win-unpacked\小龙虾AI团队.exe"

echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo  📦 打包文件检查
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.

if exist "%SETUP_EXE%" (
    echo ✅ 安装程序：存在
    for %%F in ("%SETUP_EXE%") do (
        set /a size=%%~zF/1048576
        echo    文件名：小龙虾AI团队 Setup 0.1.0.exe
        echo    大小：!size! MB
        echo    路径：%SETUP_EXE%
    )
) else (
    echo ❌ 安装程序：不存在
)

echo.

if exist "%PORTABLE_EXE%" (
    echo ✅ 便携版：存在
    echo    文件名：小龙虾AI团队.exe
    echo    路径：%PORTABLE_EXE%
) else (
    echo ❌ 便携版：不存在
)

echo.
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo  📋 应用功能清单
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.
echo  🦞 虾总管    - 任务调度和团队协调
echo  🔍 探海龙虾  - 选品分析和市场研究
echo  ✍️  执笔龙虾  - 多语种文案创作
echo  🎨 幻影龙虾  - 视觉设计和图片生成
echo  🎬 戏精龙虾  - 短视频内容策划
echo  💬 迎客龙虾  - 客服话术和买家互动
echo.
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo  🚀 快速操作
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.
echo  [1] 运行安装程序
echo  [2] 运行便携版
echo  [3] 打开输出目录
echo  [4] 查看详细报告
echo  [0] 退出
echo.
set /p choice=请选择操作 (0-4):

if "%choice%"=="1" (
    if exist "%SETUP_EXE%" (
        start "" "%SETUP_EXE%"
    ) else (
        echo 文件不存在！
        pause
    )
) else if "%choice%"=="2" (
    if exist "%PORTABLE_EXE%" (
        start "" "%PORTABLE_EXE%"
    ) else (
        echo 文件不存在！
        pause
    )
) else if "%choice%"=="3" (
    explorer "%DIST_DIR%"
) else if "%choice%"=="4" (
    if exist "BUILD_REPORT.md" (
        start "" "BUILD_REPORT.md"
    ) else (
        echo 报告文件不存在！
        pause
    )
) else if "%choice%"=="0" (
    exit
)
