# 检查 Electron 打包进度
Write-Host "检查打包进度..." -ForegroundColor Cyan

$distPath = ".\dist-electron"
if (Test-Path $distPath) {
    Write-Host "`n✓ 输出目录存在: $distPath" -ForegroundColor Green
    Get-ChildItem $distPath -Recurse | Where-Object { $_.Extension -eq ".exe" } | ForEach-Object {
        Write-Host "  找到 EXE: $($_.FullName)" -ForegroundColor Yellow
        Write-Host "  大小: $([math]::Round($_.Length / 1MB, 2)) MB" -ForegroundColor Yellow
    }
} else {
    Write-Host "✗ 输出目录不存在，打包可能还在进行中..." -ForegroundColor Yellow
}

Write-Host "`n检查 .next 构建目录..."
if (Test-Path ".\.next") {
    Write-Host "✓ Next.js 构建存在" -ForegroundColor Green
} else {
    Write-Host "✗ Next.js 构建不存在" -ForegroundColor Red
}
