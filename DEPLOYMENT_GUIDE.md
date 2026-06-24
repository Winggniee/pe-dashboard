# 🚀 Vercel Deployment Guide

## Step 1: Prepare Your Project

✅ **Files prepared** - I've already created:
- `vercel.json` - Vercel configuration
- `api/server.js` - Serverless function wrapper
- Updated `package.json` with build commands

## Step 2: Install Git (if not already installed)

1. Download Git from: https://git-scm.com/download/win
2. Install with default settings
3. Restart your terminal

## Step 3: Initialize Git Repository

Open Command Prompt in your project folder and run:

```cmd
cd "C:\Users\User\Desktop\FDE dashboard"
git init
git add .
git commit -m "Initial commit - PE Dashboard"
```

## Step 4: Create GitHub Repository

### Option A: Using GitHub Desktop (Easier)
1. Download GitHub Desktop: https://desktop.github.com/
2. Install and sign in to GitHub (create account if needed)
3. Click "Add" → "Add Existing Repository"
4. Select your project folder
5. Click "Publish repository"
6. **IMPORTANT**: Check "Keep this code private" ✅
7. Click "Publish Repository"

### Option B: Using Command Line
1. Go to https://github.com and sign in (or create account)
2. Click "+" → "New repository"
3. Name: `pe-dashboard`
4. **IMPORTANT**: Select "Private" ✅
5. Don't initialize with README
6. Click "Create repository"
7. Run these commands:

```cmd
git remote add origin https://github.com/YOUR_USERNAME/pe-dashboard.git
git branch -M main
git push -u origin main
```

## Step 5: Deploy to Vercel

1. Go to https://vercel.com
2. Click "Sign Up" and choose "Continue with GitHub"
3. Authorize Vercel to access your GitHub
4. Click "Import Project"
5. Find your `pe-dashboard` repository
6. Click "Import"
7. **IMPORTANT: Configure Environment Variables** (see below)
8. Click "Deploy"

## Step 6: Add Environment Variables (CRITICAL!)

Before deploying, add these environment variables in Vercel:

1. In Vercel project settings, go to "Environment Variables"
2. Add each variable:

| Name | Value | Source |
|------|-------|--------|
| `FEISHU_APP_ID` | `cli_aab0f4727cb9dcdc` | From your .env file |
| `FEISHU_APP_SECRET` | `i5nLWkbOGdAMZNmwdQ3U6gvoW83r1IpU` | From your .env file |
| `PORT` | `3001` | From your .env file |
| `SYNC_INTERVAL` | `1` | From your .env file |
| `FEISHU_BITABLE_IDS` | `KshewAyAuiGsChkp4GOcMCIcnje` | From your .env file |

**How to add:**
- Click "Add New"
- Enter Name
- Enter Value
- Select "Production", "Preview", and "Development"
- Click "Add"

## Step 7: Wait for Deployment

- Vercel will build and deploy (2-5 minutes)
- You'll get a URL like: `https://pe-dashboard.vercel.app`
- Share this URL with your team!

## Step 8: Test Your Deployment

1. Visit your Vercel URL
2. Click "🔄 手动同步" to sync data
3. Verify data loads correctly

## 🔄 How to Update Later

When you make changes:

```cmd
cd "C:\Users\User\Desktop\FDE dashboard"
git add .
git commit -m "Description of changes"
git push
```

Vercel will automatically redeploy!

## 🔒 Security Checklist

✅ GitHub repository is PRIVATE
✅ `.env` file is in `.gitignore` (not uploaded)
✅ Environment variables are in Vercel dashboard (encrypted)
✅ Only people with the URL can access

## ❓ Troubleshooting

**Problem: Build fails**
- Check Vercel build logs
- Ensure all environment variables are added

**Problem: "Failed to fetch PE statistics"**
- Check environment variables are correct
- Verify Feishu API credentials are valid

**Problem: Data not syncing**
- Click manual sync button
- Check Feishu Bitable ID is correct

## 📞 Need Help?

If you get stuck at any step, let me know which step and what error you see!
