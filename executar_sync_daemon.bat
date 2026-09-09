@echo off
title Dashboard Cupons - Sincronizador VTEX para Nuvem
cd /d "%~dp0"
echo ========================================================
echo   SINCRONIZADOR DE CUPONS VTEX - FARMACIAS SAO JOAO
echo ========================================================
echo   Iniciando modo continuo (atualizacao a cada 30 minutos)...
echo   Mantenha esta janela aberta para sincronizar a nuvem automaticamente.
echo ========================================================
node sync-to-cloud.js --daemon
pause
