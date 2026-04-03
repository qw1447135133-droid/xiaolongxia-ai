@echo off
echo ========================================
echo 小龙虾 AI 团队 - Electron 打包工具
echo ========================================
echo.

:menu
echo 请选择操作：
echo 1. 开始打包
echo 2. 查看打包进度
echo 3. 清理构建文件
echo 4. 打开输出目录
echo 5. 退出
echo.
set /p choice=请输入选项 (1-5):

if "%choice%"=="1" goto build
if "%choice%"=="2" goto check
if "%choice%"=="3" goto clean
if "%choice%"=="4" goto open
if "%choice%"=="5" goto end

echo 无效选项，请重新选择
goto menu

:build
echo.
echo 开始打包...
echo 提示：首次打包需要下载 Electron 运行时，可能需要 5-10 分钟
echo.
call npm run electron:build
echo.
echo 打包完成！
pause
goto menu

:check
echo.
echo 检查打包进度...
if exist "dist-electron" (
    echo ✓ 输出目录存在
    dir /s /b dist-electron\*.exe 2>nul
    if errorlevel 1 (
        echo 未找到 EXE 文件，打包可能还在进行中...
    ) else (
        echo.
        echo 找到以下可执行文件：
        dir /s dist-electron\*.exe
    )
) else (
    echo ✗ 输出目录不存在，打包尚未开始或失败
)
echo.
pause
goto menu

:clean
echo.
echo 清理构建文件...
if exist ".next" rmdir /s /q .next
if exist "dist-electron" rmdir /s /q dist-electron
if exist "build-log.txt" del build-log.txt
echo 清理完成！
echo.
pause
goto menu

:open
echo.
if exist "dist-electron" (
    explorer dist-electron
) else (
    echo 输出目录不存在
)
pause
goto menu

:end
echo.
echo 再见！
exit
