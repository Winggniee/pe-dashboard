@echo off
echo ========================================
echo   PE Dashboard - Git Setup
echo ========================================
echo.

cd /d "%~dp0"

echo Checking if Git is installed...
git --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Git is not installed!
    echo Please download and install Git from: https://git-scm.com/download/win
    echo.
    pause
    exit /b 1
)

echo [OK] Git is installed!
echo.

echo Initializing Git repository...
git init

echo.
echo Adding all files to Git...
git add .

echo.
echo Creating initial commit...
git commit -m "Initial commit - PE Dashboard"

echo.
echo ========================================
echo   Setup Complete!
echo ========================================
echo.
echo Next steps:
echo 1. Create a PRIVATE GitHub repository
echo 2. Run this command with YOUR username:
echo.
echo    git remote add origin https://github.com/YOUR_USERNAME/pe-dashboard.git
echo    git branch -M main
echo    git push -u origin main
echo.
echo 3. Then go to https://vercel.com to deploy
echo.
echo See DEPLOYMENT_GUIDE.md for detailed instructions!
echo.
pause
