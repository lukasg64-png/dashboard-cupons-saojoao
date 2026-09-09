Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Users\lucas.alves6\OneDrive - Farmácias São João\Documentos\ANTIGRAVITI\dashboard-cupons-unificado"
WshShell.Run "cmd.exe /c atualizar_online.bat", 0, False
Set WshShell = Nothing
