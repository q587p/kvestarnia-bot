[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$RepositoryRoot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = [IO.Path]::GetFullPath($RepositoryRoot).TrimEnd(
    [IO.Path]::DirectorySeparatorChar,
    [IO.Path]::AltDirectorySeparatorChar
)
$clientDir = Join-Path $repoRoot "node_modules\.prisma\client"
$enginePath = Join-Path $clientDir "query_engine-windows.dll.node"

function Get-KvestarniaNodeProcesses {
    $processMap = @{}

    try {
        Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
            ForEach-Object {
                $commandLine = [string]$_.CommandLine
                $isRepoDevProcess =
                    $commandLine -and
                    $commandLine.IndexOf($repoRoot, [StringComparison]::OrdinalIgnoreCase) -ge 0 -and
                    $commandLine -match "(?i)(ts-node-dev|src[\\/]+bot\.ts|dist[\\/]+bot\.js|npm-cli\.js.*\brun\s+dev\b)"

                if ($isRepoDevProcess) {
                    $processMap[[int]$_.ProcessId] = "repository dev process"
                }
            }
    }
    catch {
        Write-Warning "Could not inspect repository-local Node command lines: $($_.Exception.Message)"
    }

    try {
        Get-Process -Name node -ErrorAction SilentlyContinue |
            ForEach-Object {
                $process = $_

                try {
                    foreach ($module in $process.Modules) {
                        $holdsEngine = [string]::Equals(
                            $module.FileName,
                            $enginePath,
                            [StringComparison]::OrdinalIgnoreCase
                        )

                        if ($holdsEngine) {
                            $processMap[[int]$process.Id] = "Prisma engine holder"
                            break
                        }
                    }
                }
                catch {
                    # Some processes do not expose their module list to the current user.
                }
            }
    }
    catch {
        Write-Warning "Could not inspect loaded Node modules: $($_.Exception.Message)"
    }

    return $processMap
}

$stopFailures = @()

# ts-node-dev can respawn a child once after it is stopped, so scan twice.
foreach ($pass in 1..2) {
    $processes = Get-KvestarniaNodeProcesses

    if ($processes.Count -eq 0) {
        if ($pass -eq 1) {
            Write-Host "No repository-local Node process currently holds the Prisma engine."
        }
        break
    }

    $orderedProcesses = @($processes.GetEnumerator() | Sort-Object Key)

    foreach ($entry in $orderedProcesses) {
        $processId = [int]$entry.Key

        try {
            Write-Host "Stopping Kvestarnia Node process PID $processId ($($entry.Value))..."
            Stop-Process -Id $processId -Force -ErrorAction Stop
        }
        catch {
            $stopFailures += "PID $processId`: $($_.Exception.Message)"
        }
    }

    Start-Sleep -Milliseconds 800
}

if (Test-Path -LiteralPath $clientDir) {
    Get-ChildItem -LiteralPath $clientDir -Filter "query_engine-windows.dll.node.tmp*" -File -ErrorAction SilentlyContinue |
        ForEach-Object {
            try {
                Remove-Item -LiteralPath $_.FullName -Force -ErrorAction Stop
                Write-Host "Removed stale Prisma temporary file: $($_.Name)"
            }
            catch {
                Write-Warning "Could not remove $($_.Name): $($_.Exception.Message)"
            }
        }
}

if ($stopFailures.Count -gt 0) {
    foreach ($failure in $stopFailures) {
        Write-Warning $failure
    }
    exit 2
}

exit 0
