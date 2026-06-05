@echo off
echo Setting up POS System Monorepo...

echo Installing dependencies...
call pnpm install

echo Generating Prisma client...
call pnpm --filter @pos/db generate

echo Pushing database schema...
call pnpm --filter @pos/db db:push

echo.
echo Setup complete!
echo.
echo Next steps:
echo   1. Copy .env.example files and fill in your database password
echo   2. Run: pnpm dev
echo   3. Open: http://localhost:3000
echo.
