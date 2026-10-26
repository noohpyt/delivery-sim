@echo off
cd /d E:scodeprojects\delivery-sim
start "NEON-RIDER-dev" /min cmd /c "npm run dev"
ping 127.0.0.1 -n 5 >nul
start "" http://localhost:5173
