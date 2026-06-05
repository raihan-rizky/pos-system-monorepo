#!/bin/bash
echo "Setting up POS System Monorepo..."

# Install dependencies
echo "Installing dependencies..."
pnpm install

# Generate Prisma client
echo "Generating Prisma client..."
pnpm --filter @pos/db generate

# Push database schema
echo "Pushing database schema..."
pnpm --filter @pos/db db:push

echo ""
echo "Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Copy .env.example files and fill in your database password"
echo "  2. Run: pnpm dev"
echo "  3. Open: http://localhost:3000"
echo ""
