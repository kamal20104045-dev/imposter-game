Render deployment instructions for `imposter-game`

1) Push your repo to GitHub (branch `main`).

2) Sign in to Render (https://render.com) and click "New" → "Web Service".

3) Connect your GitHub account and select the `imposter-game` repository.

4) Choose "Deploy from `render.yaml`" (Render will detect `render.yaml`) or configure manually:
   - Environment: `Node`
   - Branch: `main`
   - Build Command: `cd server && npm install`
   - Start Command: `cd server && npm start`
   - Health Check Path: `/api/health`

5) Environment variables:
   - `FRONTEND_ORIGIN` — set to the origin you will host the frontend on (e.g. `https://<yourusername>.github.io` if using GitHub Pages). Leave blank to allow all origins (not recommended for production).

6) Deploy. After successful deploy Render will provide a public HTTPS URL like `https://imposter-game-server.onrender.com`.

7) Configure the frontend:
   - If you host the frontend on GitHub Pages: open `client/index.html` and set the `window.BACKEND_URL` value to the Render URL (e.g. `https://imposter-game-server.onrender.com`).
   - If you serve the frontend from the same Render service (the server already serves `client/` statically), you can leave `window.BACKEND_URL` empty and access the app at the Render URL directly.

8) (Optional) Set `FRONTEND_ORIGIN` on Render to the final frontend origin to restrict CORS.

9) Test:
   - Open frontend URL and choose "Play Online".
   - Check browser console for Socket.IO `connect` to the Render URL.
   - Invite a friend to join with the room code to verify multi-client connectivity.

Troubleshooting:
- Check Render logs for errors.
- Use `/api/health` to verify the server is up.
- If using GitHub Pages, ensure `window.BACKEND_URL` is set to the Render URL.
