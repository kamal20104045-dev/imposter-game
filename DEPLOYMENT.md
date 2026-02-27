# 🚀 Deployment Guide - Finding the Imposter

Your game is **ready to deploy!** This guide covers both local network and internet deployment.

---

## 📋 Pre-Deployment Checklist

- ✅ Server runs without errors
- ✅ Frontend works locally
- ✅ Game logic is complete
- ✅ No database required (in-memory only)
- ✅ No paid APIs or services
- ✅ Landing page with mode selection
- ✅ Works on LAN via Wi-Fi
- ✅ Can handle multiple rooms simultaneously

---

## 🌐 DEPLOYMENT OPTIONS

### Option 1: Local Network (FREE - No Internet Needed)

**Best for:** Playing with friends at home, office, or party

#### Setup:
```bash
# 1. Make sure server is running
cd imposter-game/server
npm start

# 2. Find your computer's IP address
# Windows: Open Command Prompt and run:
ipconfig

# Look for "IPv4 Address" (e.g., 192.168.1.100)

# 3. Share the URL with friends on same Wi-Fi:
# http://<YOUR_IP>:3000
# Example: http://192.168.1.100:3000
```

**That's it!** Friends on the same Wi-Fi can connect and play.

---

### Option 2: Free Cloud Hosting (For Internet Play)

#### Using **Render.com** (Recommended - Easiest)

**Step 1: Push to GitHub**
```bash
git init
git add .
git commit -m "Initial commit"
git push origin main
```

**Step 2: Deploy on Render**
1. Go to [Render.com](https://render.com)
2. Sign up (free)
3. Click "New +" → "Web Service"
4. Connect your GitHub repository
5. Fill in settings:
   - **Name:** `imposter-game`
   - **Environment:** Node
   - **Build Command:** `cd server && npm install`
   - **Start Command:** `cd server && npm start`
   - **Port:** 3000

6. Click "Create Web Service"
7. Wait 2-3 minutes for deployment
8. Get your URL: `https://your-app-name.onrender.com`

**Update your game:**
In `client/assets/game.js`, change:
```javascript
// Line ~42 in initSocket function, update for online mode:
socketUrl = 'https://your-app-name.onrender.com';
```

---

#### Using **Railway.app**

1. Go to [Railway.app](https://railway.app)
2. Sign up (free, $5 credit/month)
3. Click "New Project" → "Deploy from GitHub"
4. Select your repo
5. Railway auto-detects and configures
6. Your URL: `https://your-project.up.railway.app`

---

#### Using **Heroku** (Free tier ending - use Render instead)

---

### Option 3: VPS (For Scale/Production)

For larger deployments, consider:
- **DigitalOcean** ($5/month)
- **Linode** ($5/month)
- **AWS Free Tier** (1 year free)

---

## 🎮 Current Behavior (Both Modes)

### **Play Local**
- Connects to: Your computer's localhost
- Usage: Friends on same Wi-Fi network
- IP: `http://<your-computer-ip>:3000`

### **Play Online**
- Connects to: Deployed server URL
- Usage: Friends anywhere on internet
- URL: `https://deployed-game-url.com`

Both modes use the same game mechanics:
- Create rooms
- Join with room codes
- Multiplayer gameplay
- No accounts needed

---

## 🔧 Configuration for Production

### Important: Update Server URL for Online Mode

**File:** `client/assets/game.js`

Find the `initSocket` function (around line 40) and update:

```javascript
function initSocket(mode) {
    let socketUrl;
    
    if (mode === 'local') {
        const protocol = window.location.protocol;
        const host = window.location.host;
        socketUrl = `${protocol}//${host}`;
    } else {
        // UPDATE THIS FOR YOUR DEPLOYED SERVER
        socketUrl = 'https://YOUR-DEPLOYED-URL.com';
    }
    
    gameState.socket = io(socketUrl);
    // ... rest of function
}
```

Replace `https://YOUR-DEPLOYED-URL.com` with your actual deployed URL.

---

## 🛡️ Security Considerations

### Current Implementation:
- ✅ No user authentication (not needed for this game)
- ✅ No database (no data breaches)
- ✅ No credit card info collected
- ✅ Room codes are random (hard to guess)
- ✅ Server validates all game logic

### Recommended Additions (Optional):
1. **Rate limiting** - Prevent spam
2. **Room auto-cleanup** - Delete empty rooms after 30 min
3. **Connection limits** - Max players per server
4. **Logging** - Track errors and analytics

---

## 📱 Testing Before Deployment

### Local Testing:
```bash
# Terminal 1: Start server
cd server
npm start

# Terminal 2: Open in browser
# http://localhost:3000

# Test on phone:
# http://<your-ip>:3000
```

### Test Checklist:
- [ ] Create a room
- [ ] Join with room code
- [ ] Start game with 2+ players
- [ ] Play full game
- [ ] Exit and return to landing page
- [ ] Test on mobile browser
- [ ] Test on multiple devices

---

## 🚀 Go Live!

### Minimum Setup:
1. Deploy server to free hosting (Render/Railway)
2. Update `initSocket` with your server URL
3. Share `https://your-game-url.com` with friends
4. Everyone clicks "Play Online"
5. Create/join rooms and play!

### Advanced Setup:
1. Use custom domain name
2. Enable HTTPS (included on Render/Railway)
3. Set up analytics
4. Add Discord integration for room sharing

---

## 📊 Scaling Future

When you need to scale beyond MVP:
- Add persistent database (MongoDB)
- Implement user accounts
- Add statistics tracking
- Create matchmaking system
- Support multiple server instances
- Add admin dashboard

---

## 💡 Tips

1. **For LAN parties:** Just run locally, share IP
2. **For online friends:** Deploy to Render, share URL
3. **For testing:** Use both modes on localhost
4. **For performance:** Monitor server logs during gameplay
5. **For debugging:** Check browser console for errors

---

## 📞 Support

If deployment fails:
1. Check server console for errors
2. Verify all dependencies installed (`npm install`)
3. Check port 3000 isn't already in use
4. For cloud: Check deployment logs on hosting platform
5. Ensure Socket.IO version matches client/server

---

## ✨ You're Ready!

Your game is **fully functional and ready for production**. 

**Next steps:**
1. Choose deployment option (Local vs Cloud)
2. Test thoroughly on multiple devices
3. Share with friends
4. Have fun! 🎉

---

**Questions?** The code is well-commented. Check:
- `server/src/index.js` - Server logic
- `client/assets/game.js` - Client logic
- `README.md` - Game rules

Good luck! 🚀
