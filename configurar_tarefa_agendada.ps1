# Script PowerShell para registrar tarefa agendada no Windows
# Executa a sincronização de cupons a cada 30 minutos em segundo plano

$TaskName = "DashboardCuponsSyncSaoJoao"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$NodePath = (Get-Command node).Source
$Arguments = "$ScriptDir\sync-to-cloud.js"

Write-Host "Configurando tarefa agendada: $TaskName" -ForegroundColor Cyan
Write-Host "Diretório: $ScriptDir" -ForegroundColor Gray
Write-Host "Node: $NodePath" -ForegroundColor Gray

# Remover tarefa antiga se existir
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

# Criar ação
$Action = New-ScheduledTaskAction -Execute $NodePath -Argument "`"$Arguments`"" -WorkingDirectory $ScriptDir

# Criar gatilho: repete a cada 1 hora indefinidamente
$Trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Hours 1) -RepetitionDuration ([TimeSpan]::MaxValue)

# Configurações adicionais
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RunOnlyIfNetworkAvailable

# Registrar tarefa
Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Description "Sincroniza pedidos com cupom da VTEX a cada 1 hora (60 min)"

Write-Host "Tarefa agendada '$TaskName' criada com sucesso!" -ForegroundColor Green
Write-Host "Ela será executada a cada 1 hora em segundo plano automaticamente." -ForegroundColor Green
