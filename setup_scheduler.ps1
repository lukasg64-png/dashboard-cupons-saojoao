# setup_scheduler.ps1 — Registra a tarefa agendada no Windows Task Scheduler
# para atualizar o Dashboard Cupons Unificado a cada 30 minutos (minutos :15 e :45).

"TaskName = 'SaoJoao_DashboardCupons_GitSync'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $ScriptDir) { $ScriptDir = (Get-Location).Path }
$BatPath = Join-Path $ScriptDir 'atualizar_online.bat'
$VbsPath = Join-Path $ScriptDir 'exec_silencioso.vbs'

Write-Host 'Iniciando configuracao da tarefa agendada...' -ForegroundColor Cyan

if (-not (Test-Path $BatPath)) {
    Write-Error "Arquivo atualizar_online.bat nao encontrado em $ScriptDir"
    exit 1
}

$oldTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($oldTask) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

$Action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "//B //Nologo `""" + $VbsPath + "`"" `""" + $BatPath + "`""" -WorkingDirectory $ScriptDir

$Trigger = New-ScheduledTaskTrigger -Daily -At '00:00'
$Trigger.Repetition = (New-ScheduledTaskTrigger -Once -At '00:00' -RepetitionInterval (New-TimeSpan -Hours 1) -RepetitionDuration (New-TimeSpan -Days 1)).Repetition

$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew

try {
    Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Description 'Sincronizacao automatica a cada 1 hora do Dashboard Cupons no GitHub Pages' -Force | Out-Null
    Write-Host "`n[OK] Tarefa '$TaskName' registrada com sucesso!" -ForegroundColor Green
    Write-Host 'O Dashboard atualizara e enviara para o GitHub Pages a nova versao a cada 1 hora.' -ForegroundColor Green
    Write-Host 'Link Online: https://lukasg64-png.github.io/dashboard-cupons-saojoao/' -ForegroundColor Cyan
} catch {
    Write-Warning "Nao foi possivel registrar a tarefa: $_"
}
