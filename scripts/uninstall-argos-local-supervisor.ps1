$Startup = [Environment]::GetFolderPath("Startup")
$VbsPath = Join-Path $Startup "ARGOS Local Supervisor.vbs"

Remove-Item $VbsPath -Force -ErrorAction SilentlyContinue

$ids = @(Get-NetTCPConnection -LocalPort 8786 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
foreach ($id in $ids) {
  if ($id) {
    Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
  }
}

Write-Host "ARGOS Local Supervisor removido do Startup do usuario." -ForegroundColor Green
