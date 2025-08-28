# Deployment Guide for YT Backend on Render

## Backend Deployment Steps

### 1. Prepare Your Repository
- Ensure your code is pushed to a Git repository (GitHub, GitLab, etc.)
- Make sure you have the following files in your `yt-backend` directory:
  - `server.js` ✅
  - `package.json` ✅
  - `render.yaml` ✅
  - `env-template.txt` ✅

### 2. Deploy to Render

1. **Go to [Render.com](https://render.com)** and sign up/login
2. **Click "New +"** and select "Web Service"
3. **Connect your repository** and select the `yt-backend` folder
4. **Configure the service:**
   - **Name**: `yt-backend` (or your preferred name)
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free (or choose your preferred plan)

### 3. Set Environment Variables

In your Render service dashboard, go to **Environment** tab and add:

```
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/database_name
NODE_ENV=production
PORT=10000
```

**Important**: Replace the MongoDB URI with your actual connection string!

### 4. Deploy

Click **"Create Web Service"** and wait for the deployment to complete.

### 5. Get Your Render URL

Once deployed, you'll get a URL like: `https://your-app-name.onrender.com`

## Frontend Updates

### 1. Update Extension Configuration

In `yt-extension/config.js`, replace:
```javascript
apiBase: 'https://your-app-name.onrender.com'
```
with your actual Render URL.

### 2. Update Background Script

In `yt-extension/background.js`, replace:
```javascript
const API_BASE = 'https://your-app-name.onrender.com';
```
with your actual Render URL.

### 3. Test the Connection

1. Load the updated extension in Chrome
2. Go to YouTube and open the extension popup
3. Check the browser console for connection logs
4. Verify that the health check endpoint works: `https://your-app-name.onrender.com/health`

## Verification Steps

### Backend Health Check
```bash
curl https://your-app-name.onrender.com/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "mongodb": "connected",
  "environment": "production",
  "port": 10000
}
```

### Test API Endpoints
```bash
# Test profile endpoint
curl -X POST https://your-app-name.onrender.com/profile/save \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com"}'

# Test video endpoint
curl -X POST https://your-app-name.onrender.com/video/complete \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","videoId":"test123","title":"Test Video"}'
```

## Troubleshooting

### Common Issues

1. **CORS Errors**: Ensure your Render domain is properly configured in the CORS settings
2. **MongoDB Connection**: Verify your MongoDB URI is correct and accessible
3. **Port Issues**: Render automatically sets the PORT environment variable
4. **Build Failures**: Check that all dependencies are in package.json

### Debug Commands

```bash
# Check Render logs
# Go to your service dashboard → Logs tab

# Test local connection
npm run test

# Check environment variables
echo $MONGO_URI
echo $NODE_ENV
echo $PORT
```

## Security Notes

- Never commit `.env` files to your repository
- Use environment variables for sensitive information
- Consider adding rate limiting for production use
- Monitor your Render service usage and costs

## Support

If you encounter issues:
1. Check the Render logs in your service dashboard
2. Verify your environment variables are set correctly
3. Test your MongoDB connection locally first
4. Check the browser console for CORS or network errors
