param(
  [switch]$NoBrowser,
  [ValidateRange(1, 65535)][int]$Port = 4173
)
$ErrorActionPreference = 'Stop'
$projectRoot = Join-Path $PSScriptRoot 'fa-kakao-demo'
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$nodeExe = if ($nodeCommand) { $nodeCommand.Source } else { Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' }
if (-not (Test-Path -LiteralPath $nodeExe)) { throw 'Node.js 22.13 이상을 설치해 주세요.' }
$nodeVersion = [version]((& $nodeExe --version).Trim().TrimStart('v'))
if ($nodeVersion -lt [version]'22.13.0') { throw 'Node.js 22.13 이상이 필요해요.' }
foreach ($file in @('fa-kakao-demo/server.mjs', 'fa-kakao-demo/public/index.html', 'fa-engine/src/policy.js', 'fa-trust/dist/fa-trust.js')) {
  if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot $file))) { throw "Cheese 원본 파일이 없어요: $file" }
}
$appUrl = "http://127.0.0.1:$Port"
function Test-CheeseReady {
  try {
    $status = Invoke-RestMethod "$appUrl/api/status" -TimeoutSec 2
    $page = Invoke-WebRequest $appUrl -UseBasicParsing -TimeoutSec 2
    return ($status.mode -in @('demo', 'live') -and $page.Content -match '/cheese/profile.svg' -and $page.Content -match 'id="shell"')
  } catch { return $false }
}
if (-not (Test-CheeseReady)) {
  $probe = New-Object System.Net.Sockets.TcpClient
  $occupied = $false
  try { $probe.Connect('127.0.0.1', $Port); $occupied = $true } catch { } finally { $probe.Dispose() }
  if ($occupied) { throw "$Port 포트를 다른 프로그램이 사용 중이에요. Start-Cheese.ps1 -Port 4174로 다른 포트를 사용해 주세요." }
  $logRoot = Join-Path $projectRoot '.data'
  New-Item -ItemType Directory -Path $logRoot -Force | Out-Null
  $previousPort = [Environment]::GetEnvironmentVariable('PORT', 'Process')
  try {
    $env:PORT = [string]$Port
    $process = Start-Process -FilePath $nodeExe -ArgumentList @('server.mjs') -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logRoot "cheese-$Port.stdout.log") -RedirectStandardError (Join-Path $logRoot "cheese-$Port.stderr.log")
  } finally { [Environment]::SetEnvironmentVariable('PORT', $previousPort, 'Process') }
  $ready = $false
  for ($attempt = 0; $attempt -lt 24; $attempt++) {
    Start-Sleep -Milliseconds 250
    if (Test-CheeseReady) { $ready = $true; break }
    if ($process.HasExited) { break }
  }
  if (-not $ready) { throw "Cheese를 시작하지 못했어요. $logRoot 의 cheese-$Port.stderr.log를 확인해 주세요." }
  Write-Host "Cheese 서버 PID: $($process.Id)"
}
Write-Host "Cheese 가족 채팅: $appUrl"
$status = Invoke-RestMethod "$appUrl/api/status" -TimeoutSec 3
if ($status.mode -eq 'demo') { Write-Host 'GitHub main의 Cheese 원본 화면 · 샘플 응답 모드' }
else { Write-Host 'GitHub main의 Cheese 원본 화면 · 연결된 AI 응답 모드' }
if (-not $NoBrowser) { Start-Process $appUrl }
