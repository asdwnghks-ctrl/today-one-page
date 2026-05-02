$ErrorActionPreference = "Stop"

Set-Location (Resolve-Path "$PSScriptRoot\..")

Write-Host ""
Write-Host "Supabase 연결 도우미" -ForegroundColor Cyan
Write-Host "토큰과 DB 비밀번호는 이 창에만 입력하고, GitHub에는 저장하지 않습니다." -ForegroundColor DarkGray
Write-Host ""

$token = Read-Host "Supabase access token 붙여넣기"
if ([string]::IsNullOrWhiteSpace($token)) {
  throw "Access token이 비어 있습니다."
}

$env:SUPABASE_ACCESS_TOKEN = $token.Trim()

Write-Host ""
Write-Host "Supabase 프로젝트 목록을 가져옵니다..." -ForegroundColor Cyan
npx supabase projects list

Write-Host ""
$projectRef = Read-Host "today-one-page 프로젝트의 REFERENCE ID 입력"
if ([string]::IsNullOrWhiteSpace($projectRef)) {
  throw "Project ref가 비어 있습니다."
}

Write-Host ""
Write-Host "이제 Supabase 프로젝트를 로컬 저장소에 연결합니다." -ForegroundColor Cyan
Write-Host "DB password를 물어보면 복사해둔 비밀번호를 붙여넣고 Enter를 누르세요." -ForegroundColor Yellow
Write-Host ""

npx supabase link --project-ref $projectRef.Trim()

Write-Host ""
Write-Host "완료되면 이 창을 닫아도 됩니다." -ForegroundColor Green
