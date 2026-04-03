@echo off
chcp 65001 >nul
cls
echo.
echo ╔════════════════════════════════════════════════════════════╗
echo ║                                                            ║
echo ║          🔧 清理并重新打包工具                            ║
echo ║                                                            ║
echo ╚════════════════════════════════════════════════════════════╝
echo.

echo [1/4] 正在关闭所有应用实例...
taskkill /F /IM "小龙虾AI团队.exe" 2>nul
if %errorlevel% == 0 (
    echo ✓ 已关闭运行中的应用
    timeout /t 2 /nobreak >nul
) else (
    echo ℹ 没有运行中的应用
)

echo.
echo [2/4] 正在清理构建目录...
if exist "dist-electron" (
    rmdir /s /q "dist-electron" 2>nul
    if %errorlevel% == 0 (
        echo ✓ 已清理 dist-electron
    ) else (
        echo ⚠ 部分文件可能被占用，尝试强制清理...
        timeout /t 2 /nobreak >nul
        rmdir /s /q "dist-electron" 2>nul
    )
) else (
    echo ℹ dist-electron 目录不存在
)

if exist ".next" (
    rmdir /s /q ".next" 2>nul
    echo ✓ 已清理 .next
)

if exist "out" (
    rmdir /s /q "out" 2>nul
    echo ✓ 已清理 out
)

echo.
echo [3/4] 等待文件系统释放...
timeout /t 3 /nobreak >nul

echo.
echo [4/4] 开始重新打包...
echo.
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.

call npm run electron:build

echo.
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.

if exist "dist-electron\小龙虾AI团队 Setup 0.1.0.exe" (
    echo.
    echo ╔════════════════════════════════════════════════════════════╗
    echo ║                                                            ║
    echo ║          ✅ 打包成功！                                     ║
    echo ║                                                            ║
    echo ╚════════════════════════════════════════════════════════════╝
    echo.
    echo 生成的文件：
    echo   - 安装程序：dist-electron\小龙虾AI团队 Setup 0.1.0.exe
    echo   - 便携版：  dist-electron\win-unpacked\小龙虾AI团队.exe
    echo.

    set /p run=是否立即运行便携版？(Y/N):
    if /i "%run%"=="Y" (
        start "" "dist-electron\win-unpacked\小龙虾AI团队.exe"
    )
) else (
    echo.
    echo ╔════════════════════════════════════════════════════════════╗
    echo ║                                                            ║
    echo ║          ❌ 打包失败                                       ║
    echo ║                                                            ║
    echo ╚════════════════════════════════════════════════════════════╝
    echo.
    echo 请检查上面的错误信息
    echo.
)

pause
