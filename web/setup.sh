#!/bin/bash

# Setup script for Monad Scanner Web
# This copies necessary scanner files to the web directory

echo "🚀 Setting up Monad Scanner Web..."

# Copy scanner files to lib directory
echo "📁 Copying scanner files..."
mkdir -p lib
cp ../scan-token.js lib/
cp ../price-service.js lib/
cp ../rpc-endpoints.js lib/

echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Run: npm install"
echo "2. Create .env.local with your RPC URL"
echo "3. Run: npm run dev"

