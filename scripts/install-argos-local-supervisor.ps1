$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$Startup = [Environment]::GetFolderPath("Startup")
$CmdPath = Join-Path $Root "scripts\start-argos-local-supervisor.cmd"
$VbsPath = Join-Path $Startup "ARGOS Local Supervisor.vbs"

$vbs = @"
Set shell = CreateObject("WScript.Shell")
shell.Run Chr(34) & "$CmdPath" & Chr(34), 0, False
"@

Set-Content -Encoding ASCII -Path $VbsPath -Value $vbs

$ids = @(Get-NetTCPConnection -LocalPort 8786 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
foreach ($id in $ids) {
  if ($id) {
    Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
  }
}

Start-Process -FilePath "wscript.exe" -ArgumentList "`"$VbsPath`""

Write-Host "ARGOS Local Supervisor instalado no Startup do usuario e iniciado agora." -ForegroundColor Green
Write-Host "Ele NAO liga Ollama automaticamente. Apenas aguarda o botao Ligar IA local." -ForegroundColor Yellow
Write-Host "Startup:" $VbsPath
