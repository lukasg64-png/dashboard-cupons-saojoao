@echo off
schtasks /create /tn "SaoJoao_DashboardCupons_GitSync" /tr "wscript.exe \"C:\Users\lucas.alves6\OneDrive - Farmácias São João\Documentos\ANTIGRAVITI\dashboard-cupons-unificado\executar_sync_invisivel.vbs\"" /sc minute /mo 30 /f
if errorlevel 1 (
    echo Falha ao registrar via schtasks
) else (
    echo Tarefa agendada com SUCESSO!
)
