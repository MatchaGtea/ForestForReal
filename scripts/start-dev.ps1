$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $taskRoot
if (-not (Test-Path -LiteralPath '.venv\Scripts\python.exe')) {
    throw 'Install backend dependencies first; see README.md'
}
# Launch background servers without opening extra terminal windows.
New-Item -ItemType Directory -Force -Path "$taskRoot\.cache" | Out-Null
Start-Process -FilePath "$taskRoot\.venv\Scripts\python.exe" -ArgumentList '-m', 'uvicorn', 'backend.main:app', '--host', '127.0.0.1', '--port', '8000' -WorkingDirectory $taskRoot -WindowStyle Hidden -RedirectStandardOutput "$taskRoot\.cache\backend.log" -RedirectStandardError "$taskRoot\.cache\backend-error.log"
Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', 'npm run dev' -WorkingDirectory "$taskRoot\frontend" -WindowStyle Hidden -RedirectStandardOutput "$taskRoot\.cache\frontend.log" -RedirectStandardError "$taskRoot\.cache\frontend-error.log"
Write-Output 'ForestProof: http://localhost:5173 · API: http://127.0.0.1:8000/docs'
