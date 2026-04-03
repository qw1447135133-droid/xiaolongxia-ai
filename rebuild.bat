@echo off
cd /d "%~dp0"
echo Rebuilding application...
call npm run electron:build
echo Done!
pause
