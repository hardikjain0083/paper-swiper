# YT Extension Debug Guide

## Issue: "Progress Not Saved" Error

If you're seeing "⚠️ Could not save progress" after completing a video, follow these debugging steps:

### 1. Check Backend Server Status
- Ensure the backend server is running: `npm start` in `yt-backend` folder
- Test the health endpoint: `http://localhost:5000/health`
- Should return: `{"status":"ok","mongodb":"connected"}`

### 2. Check Extension Authentication
- Open the extension popup
- Make sure you're signed in (check the Dashboard tab)
- Verify your email is displayed correctly

### 3. Check Browser Console
- Open YouTube in a new tab
- Press F12 to open Developer Tools
- Go to Console tab
- Look for messages starting with:
  - ✅ YT Progress Tracker: Backend connected successfully
  - 🔍 Current user state: {email: "...", name: "..."}
  - 🎯 Attempting to save progress: {...}
  - ✅ Progress saved or ❌ Error messages

### 4. Test API Endpoints Manually
Open `test-extension.html` in your browser to test:
- Health endpoint
- Profile endpoint  
- Video endpoint

### 5. Common Issues & Solutions

#### Issue: "Backend not connected"
**Solution:** Check if server is running on port 5000

#### Issue: "No user found in storage"
**Solution:** Sign in through the extension popup first

#### Issue: CORS errors
**Solution:** Backend CORS is configured, but if issues persist:
- Try using the test page first
- Check if localhost:5000 is accessible

#### Issue: Network errors
**Solution:** 
- Check firewall settings
- Ensure no antivirus is blocking localhost connections
- Try `ping localhost` in terminal

### 6. Manual Testing Steps

1. **Start Backend:**
   ```bash
   cd yt-backend
   npm start
   ```

2. **Load Extension:**
   - Go to `chrome://extensions/`
   - Enable Developer mode
   - Load unpacked extension from `yt-extension` folder

3. **Sign In:**
   - Click extension icon
   - Enter email and name
   - Click "Sign Up / Save Profile"

4. **Test Video:**
   - Go to any YouTube video
   - Watch until completion
   - Check console for debug messages

### 7. Expected Console Output

```
✅ YT Progress Tracker: Backend connected successfully
🔍 Current user state: {email: "test@example.com", name: "Test User"}
🎯 Attempting to save progress: {email: "test@example.com", videoId: "...", ...}
✅ Profile saved successfully
✅ Video progress saved successfully: {success: true, message: "..."}
```

### 8. If Still Not Working

1. Check if MongoDB is accessible
2. Verify .env file has correct MONGO_URI
3. Try restarting the backend server
4. Check Chrome extension permissions
5. Try in an incognito window

### 9. Contact Support

If none of the above works, provide:
- Console error messages
- Backend server logs
- Extension version
- Chrome version
- Operating system


