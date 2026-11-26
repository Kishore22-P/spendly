@echo off
cd /d "%~dp0"
echo Starting Spendly server (Firebase Auth + PostgreSQL) at http://localhost:8080 ...
start "" "http://localhost:8080/"
node server.js
pause
