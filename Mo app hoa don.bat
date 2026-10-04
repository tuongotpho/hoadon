@echo off
chcp 65001 >nul
title Quan ly hoa don - DUNG TAT CUA SO NAY khi dang dung app
cd /d "%~dp0"
if not exist node_modules (
  echo Lan dau chay: dang cai thu vien, doi 1-2 phut...
  call npm install
)
echo.
echo  App dang chay tai http://localhost:5180
echo  Tat cua so nay = tat app. Du lieu van con nguyen.
echo.
start "" http://localhost:5180
call npm run dev
