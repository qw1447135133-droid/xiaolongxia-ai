@echo off
chcp 65001 >nul
title 小龙虾 AI 团队 - 快速启动

echo.
echo ========================================
echo   🦞 小龙虾 AI 团队
echo ========================================
echo.
echo 选择启动方式：
echo.
echo [1] 运行安装程序
echo [2] 运行便携版（免安装）
echo [3] 打开输出目录
echo [4] 查看构建报告
echo [5] 退出
echo.

set /p choice=请输入选项 (1-5):

if "%choice%"=="1" (
    if exist "dist-electron\小龙虾AI团队 Setup 0.1.0.exe" (
        echo.
        echo 正在启动安装程序...
        start "" "dist-electron\小龙虾AI团队 Setup 0.1.0.exe"
    ) else (
        echo.
        echo ❌ 安装程序不存在，请先运行打包
        pause
    )
) else if "%choice%"=="2" (
    if exist "dist-electron\win-unpacked\小龙虾AI团队.exe" (
        echo.
        echo 正在启动便携版...
        start "" "dist-electron\win-unpacked\小龙虾AI团队.exe"
    ) else (
        echo.
        echo ❌ 便携版不存在，请先运行打包
        pause
    )
) else if "%choice%"=="3" (
    if exist "dist-electron" (
        explorer dist-electron
    ) else (
        echo.
        echo ❌ 输出目录不存在
        pause
    )
) else if "%choice%"=="4" (
    if exist "BUILD_REPORT.md" (
        start "" "BUILD_REPORT.md"
    ) else (
        echo.
        echo ❌ 构建报告不存在
        pause
    )
) else if "%choice%"=="5" (
    exit
) else (
    echo.
    echo ❌ 无效选项
    pause
)
