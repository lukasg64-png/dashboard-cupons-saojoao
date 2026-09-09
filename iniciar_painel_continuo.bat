@echo off
chcp 65001 > nul
cls
echo ===============================================================================
echo   PAINEL DE CUPONS EM TEMPO REAL - FARMACIAS SAO JOAO
echo   Iniciando Daemon de Atualizacao Continua (VTEX OMS -^> GitHub Pages)
echo ===============================================================================
echo.

python "%~dp0auto_sync_daemon.py"
pause
