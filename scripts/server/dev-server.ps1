# dev-server.ps1
# Smart dev server starter - kills port if in use, then starts dev mode

$PORT = 4001
$MAX_RETRIES = 3
$RETRY_DELAY = 2
$PROJECT_ROOT = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

Write-Host "==========================================="
Write-Host "DEV MODE - SMART STARTER" -ForegroundColor Cyan
Write-Host "==========================================="

function Wait-UntilPortFree {
    param([int]$Port)

    for ($i = 0; $i -lt 15; $i++) {
        $stillInUse = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
        if (-not $stillInUse) {
            Write-Host "  Port $Port is now free" -ForegroundColor Green
            return $true
        }

        Start-Sleep -Milliseconds 500
    }

    Write-Host "  Warning: Port still in use" -ForegroundColor Red
    return $false
}

function Stop-OrphanedBackendProcesses {
    Write-Host "`nChecking for orphaned backend dev processes..." -ForegroundColor Yellow

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

function Stop-ProcessOnPort {
    param([int]$Port)

    Write-Host "`nChecking if port $Port is in use..." -ForegroundColor Yellow

    try {
        $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue

        if (-not $connections) {
            Write-Host "  Port $Port is free" -ForegroundColor Green
            return $true
        }

        $processIds = $connections | Select-Object -ExpandProperty OwningProcess -Unique

        foreach ($processId in $processIds) {
            if ($processId -eq 0 -or $processId -eq 4) {
                Write-Host "  Skipping system process (PID: $processId)" -ForegroundColor Gray
                continue
            }

            $processInfo = Get-Process -Id $processId -ErrorAction SilentlyContinue
            if (-not $processInfo) {
                continue
            }

            Write-Host "  Found process: $($processInfo.ProcessName) (PID: $processId)" -ForegroundColor Red
            Write-Host "  Killing process tree..." -ForegroundColor Yellow
            cmd /c "taskkill /PID $processId /T /F" | Out-Null
        }

        Write-Host "  Waiting for port to be released..." -ForegroundColor Yellow
        return Wait-UntilPortFree -Port $Port
    } catch {
        Write-Host "  Error checking port: $_" -ForegroundColor Red
        return $false
    }
}

Stop-OrphanedBackendProcesses

# Try to free the port
$attempt = 1
$portFree = $false

while ($attempt -le $MAX_RETRIES -and -not $portFree) {
    if ($attempt -gt 1) {
        Write-Host "`nRetry attempt $attempt of $MAX_RETRIES..." -ForegroundColor Yellow
    }
    
    $portFree = Stop-ProcessOnPort -Port $PORT
    
    if (-not $portFree) {
        if ($attempt -lt $MAX_RETRIES) {
            Write-Host "Waiting ${RETRY_DELAY}s before retry..." -ForegroundColor Yellow
            Start-Sleep -Seconds $RETRY_DELAY
        }
    }
    
    $attempt++
}

if (-not $portFree) {
    Write-Host "`nERROR: Could not free port $PORT after $MAX_RETRIES attempts" -ForegroundColor Red
    Write-Host "Please manually check and kill the process using port $PORT" -ForegroundColor Yellow
    Write-Host "Command: netstat -ano | findstr :$PORT" -ForegroundColor Gray
    exit 1
}

Write-Host "`n==========================================="
Write-Host "STARTING DEV SERVER" -ForegroundColor Green
Write-Host "==========================================="
Write-Host "TypeScript watch + Auto-restart enabled" -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop" -ForegroundColor Gray
Write-Host ""

# Run dev mode (TypeScript watch + nodemon)
pnpm exec concurrently --kill-others-on-fail "tsc --watch" "nodemon"
