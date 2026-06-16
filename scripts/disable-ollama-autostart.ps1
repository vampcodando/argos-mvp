$ErrorActionPreference = "SilentlyContinue"

Write-Host "Removendo entradas de auto-start do Ollama..." -ForegroundColor Cyan

$startup = [Environment]::GetFolderPath("Startup")
Get-ChildItem $startup -Filter "*Ollama*" | Remove-Item -Force

$runKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
$props = Get-ItemProperty $runKey

foreach ($prop in $props.PSObject.Properties) {
  $name = $prop.Name
  $value = [string]$prop.Value

  if ($name -match "Ollama" -or $value -match "Ollama") {
    Remove-ItemProperty -Path $runKey -Name $name -Force
    Write-Host "Removido HKCU Run:" $name
  }
}

Get-ScheduledTask |
  Where-Object {
    $_.TaskName -match "Ollama" -or
    $_.TaskPath -match "Ollama" -or
    ($_.Actions | Out-String) -match "Ollama"
  } |
  ForEach-Object {
    Disable-ScheduledTask -TaskName $_.TaskName -TaskPath $_.TaskPath | Out-Null
    Write-Host "Task desabilitada:" $_.TaskPath$_.TaskName
  }

Write-Host "Auto-start do Ollama tratado. O ARGOS Supervisor passa a controlar o ciclo." -ForegroundColor Green
