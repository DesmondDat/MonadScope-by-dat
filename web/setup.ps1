# Setup script for Monad Scanner Web (PowerShell)
# This copies necessary scanner files to the web directory

Write-Host "🚀 Setting up Monad Scanner Web..." -ForegroundColor Cyan

# Copy scanner files to lib directory
Write-Host "📁 Copying scanner files..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path "lib" | Out-Null
Copy-Item "..\scan-token.js" -Destination "lib\" -Force
Copy-Item "..\price-service.js" -Destination "lib\" -Force
Copy-Item "..\rpc-endpoints.js" -Destination "lib\" -Force

Write-Host "✅ Setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:"
Write-Host "1. Run: npm install"
Write-Host "2. Create .env.local with your RPC URL"
Write-Host "3. Run: npm run dev"

