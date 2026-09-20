@echo off
setlocal
chcp 65001 >nul
node "%~dp0streamed-vlc.mjs" %*
if errorlevel 1 pause
