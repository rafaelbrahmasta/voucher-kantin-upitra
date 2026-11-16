# Jalankan Backend Rust Sistem Voucher Kantin UPITRA
$env:PATH += ";$env:USERPROFILE\.cargo\bin"
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Memulai Backend Rust: Sistem Voucher Kantin UPITRA     " -ForegroundColor Cyan
Write-Host "  Port: http://localhost:8080                             " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Set-Location -Path "$PSScriptRoot\backend-rust"
cargo run
