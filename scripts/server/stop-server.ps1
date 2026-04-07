# stop-server.ps1
# Gracefully stops the server by killing process on port 4001

$PORT = 4001
$PROJECT_ROOT = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

function Wait-UntilPortFree {
    param([int]$Port)

    for ($i = 0; $i -lt 15; $i++) {
        $stillRunning = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
        if (-not $stillRunning) {
            Write-Host "`nAll processes stopped. Port $Port is free." -ForegroundColor Green
            return $true
        }

        Start-Sleep -Milliseconds 500
    }

    Write-Host "`nWarning: Some processes may still be using port $PORT" -ForegroundColor Yellow
    return $false
}

function Stop-OrphanedBackendProcesses {
    Write-Host "`nLooking for orphaned backend watcher processes..." -ForegroundColor Yellow

    $keywords = @('nodemon', 'tsc --watch', 'dist/index.js', 'concurrently')

    $processes = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object {
            $commandLine = $_.CommandLine
            $_.ProcessId -ne $PID -and
            $commandLine -and
            $commandLine.Contains($PROJECT_ROOT) -and
            (($keywords | Where-Object { $commandLine -like "*$_*" }).Count -gt 0)
        }

    foreach ($process in $processes) {
        Write-Host "  Killing orphaned process: $($process.Name) (PID: $($process.ProcessId))" -ForegroundColor Red
        cmd /c "taskkill /PID $($process.ProcessId) /T /F" | Out-Null
    }
}

Write-Host "==========================================="
Write-Host "STOPPING SERVER" -ForegroundColor Red
Write-Host "==========================================="

Write-Host "`nLooking for processes using port $PORT..." -ForegroundColor Yellow

try {
    $connections = Get-NetTCPConnection -LocalPort $PORT -ErrorAction SilentlyContinue
    
    if ($connections) {
        $processes = $connections | Select-Object -ExpandProperty OwningProcess -Unique
        
        Write-Host "Found $($processes.Count) process(es) to stop" -ForegroundColor Yellow
        
        foreach ($processId in $processes) {
            try {
                $processInfo = Get-Process -Id $processId -ErrorAction SilentlyContinue
                if ($processInfo) {
                    Write-Host "`nProcess: $($processInfo.ProcessName) (PID: $processId)" -ForegroundColor White
                    Write-Host "Stopping process tree..." -ForegroundColor Yellow
                    cmd /c "taskkill /PID $processId /T /F" | Out-Null
                    Write-Host "Stopped successfully" -ForegroundColor Green
                }
            } catch {
                Write-Host "Warning: Could not stop process $processId - $_" -ForegroundColor Yellow
            }
        }

        [void](Wait-UntilPortFree -Port $PORT)
    } else {
        Write-Host "No processes found using port $PORT" -ForegroundColor Green
    }
} catch {
    Write-Host "Error: $_" -ForegroundColor Red
    exit 1
}

Stop-OrphanedBackendProcesses
[void](Wait-UntilPortFree -Port $PORT)

Write-Host "`n==========================================="
Write-Host "DONE" -ForegroundColor Green
Write-Host "==========================================="
