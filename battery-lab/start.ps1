param([int]$Port = 8765, [switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$localPython = Join-Path $PSScriptRoot '.venv/Scripts/python.exe'
$codexPython = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
$workspacePython = Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) 'battery-venv/Scripts/python.exe'
if (Test-Path -LiteralPath $localPython) { $batteryPython = $localPython }
elseif (Test-Path -LiteralPath $workspacePython) { $batteryPython = $workspacePython }
else {
    if (Test-Path -LiteralPath $codexPython) { $bootstrap = $codexPython }
    elseif (Get-Command py -ErrorAction SilentlyContinue) {
        $bootstrap = (& py -3.12 -c 'import sys; print(sys.executable)').Trim()
    } else { throw 'Install Python 3.12, then run this script again.' }
    & $bootstrap -m venv --without-pip .venv
    if ($LASTEXITCODE -ne 0) { throw 'Could not create local Python environment.' }
    $batteryPython = $localPython
    & $bootstrap -m pip --python $batteryPython install -r requirements-lock.txt
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed; check network/proxy settings.' }
}
& $batteryPython -c 'import importlib.util, numpy; assert all(importlib.util.find_spec(x) for x in ["fastapi", "uvicorn", "blast"]); assert numpy.__version__ == "2.2.6"'
if ($LASTEXITCODE -ne 0) { throw 'Dependencies are incomplete. See README installation steps.' }
Write-Host "Battery Choices: http://127.0.0.1:$Port"
Write-Host 'Keep this window open. Press Ctrl+C to stop.'
if (-not $NoBrowser) { Start-Process "http://127.0.0.1:$Port" }
& $batteryPython -m uvicorn app:app --host 127.0.0.1 --port $Port
