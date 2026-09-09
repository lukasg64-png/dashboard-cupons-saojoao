@echo off
pushd %~dp0
if not exist logs mkdir logs
set LOG=logs\auto_sync.log
echo. >> %LOG%
echo ====================================================================== >> %LOG%
echo [%date% %time%] INICIANDO ATUALIZACAO - DASHBOARD CUPONS SAO JOAO >> %LOG%
echo ====================================================================== >> %LOG%

echo ======================================================================
echo   ATUALIZACAO ONLINE - DASHBOARD CUPONS FARMACIAS SAO JOAO
echo ======================================================================
echo.
echo [1/3] Exportando dados estaticos (Hoje + Historico SQLite)...
node export_static_data.js >> %LOG% 2>&1
echo.
echo [2/3] Gerando bundle de producao (Vite)...
call npm run build >> %LOG% 2>&1
echo.
echo [3/3] Publicando no GitHub Pages (Online para Diretoria)...
python deploy_pages.py >> %LOG% 2>&1
if errorlevel 1 (
    echo Erro ao publicar no GitHub Pages. Verifique logs\auto_sync.log
) else (
    echo.
    echo ======================================================================
    echo   PUBLICACAO CONCLUIDA COM SUCESSO!
    echo   Dashboard Online: https://lukasg64-png.github.io/dashboard-cupons-saojoao/
    echo ======================================================================
    echo [%date% %time%] ATUALIZACAO CONCLUIDA COM SUCESSO! >> %LOG%
)
popd
exit /b 0
