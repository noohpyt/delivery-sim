@echo off
rem 霓虹骑手 NEON RIDER —— 一键启动开发服务器并打开浏览器
cd /d E:\vscodeprojects\delivery-sim
start "NEON RIDER dev server (关闭此窗口即停止)" /min cmd /c "npm run dev"
timeout /t 4 /nobreak >nul
start "" http://localhost:5173
