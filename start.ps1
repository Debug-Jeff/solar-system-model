# Starts the Go backend (:8080) and Vite frontend (:5173) together,
# freeing up either port first if a previous run got left dangling
# (e.g. a crashed session, or Ctrl+C that didn't kill the child process).

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

function Stop-PortOwner {
    param([int]$Port)
    $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    $ownerIds = $conns | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($procId in $ownerIds) {
        if ($procId -and $procId -ne 0) {
            $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
            $name = if ($proc) { $proc.ProcessName } else { 'unknown' }
            Write-Host "Port $Port is held by PID $procId ($name) - stopping it"
            Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        }
    }
}

Write-Host "Freeing ports 8080 and 5173 if in use..."
Stop-PortOwner -Port 8080
Stop-PortOwner -Port 5173
Start-Sleep -Milliseconds 300

Write-Host "Starting backend (go run .) on :8080..."
$backend = Start-Process -FilePath 'go' -ArgumentList 'run', '.' `
    -WorkingDirectory (Join-Path $root 'backend') `
    -PassThru -WindowStyle Normal

Write-Host "Starting frontend (npm run dev) on :5173..."
$frontend = Start-Process -FilePath 'npm.cmd' -ArgumentList 'run', 'dev' `
    -WorkingDirectory (Join-Path $root 'frontend') `
    -PassThru -WindowStyle Normal

Write-Host ""
Write-Host "Backend PID:  $($backend.Id)  (window: solar-system backend)"
Write-Host "Frontend PID: $($frontend.Id)  (window: solar-system frontend)"
Write-Host ""
Write-Host "Each is running in its own window - close them, or Ctrl+C inside each, to stop."
Write-Host "Re-run this script any time; it will kill whatever is still bound to 8080/5173 first."
