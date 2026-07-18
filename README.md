# Bestie Chat 💬

A tiny, private, real-time chat app just for you and your best friend. No ads, no tracking, no accounts — just pick a name and chat.

## Run it locally (to test)
```
npm install
node server.js
```
Then open http://localhost:3000 in your browser. Open it in two tabs to test with two "users."

## Put it online for free (so your bestie can join from anywhere)

**Easiest option: Render.com (free tier)**
1. Create a free account at https://render.com
2. Push this folder to a new GitHub repo (or use Render's "upload" option)
3. On Render: New → Web Service → connect your repo
4. Build command: `npm install`
5. Start command: `node server.js`
6. Deploy — Render gives you a free URL like `https://bestie-chat.onrender.com`
7. Send that link to your bestie. Done!

**Other free options that work the same way:** Railway.app, Fly.io, Glitch.com (Glitch even lets you paste code directly in the browser, no GitHub needed).

## How it works
- `server.js` — Node.js backend using Express (serves the page) + Socket.io (real-time messaging)
- `public/index.html` — the chat UI (HTML/CSS/JS, no frameworks needed)
- Messages live in the server's memory (last 200 messages) so a refresh doesn't lose history — but a server restart will clear it, since there's no database yet.

## Ideas to extend it later
- Add a database (like free SQLite or MongoDB Atlas free tier) so messages persist forever
- Add image/file sharing
- Add a simple password so randoms can't join if they find the link
- Add push notifications
- Make it a PWA so it installs like an app on your phone

Want any of these added? Just ask!
