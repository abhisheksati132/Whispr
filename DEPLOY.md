# Whispr Deployment Guide

## Pre-Deployment Checklist

- [ ] `npm test` passes (22/22)
- [ ] `supabase_schema.sql` executed in Supabase SQL Editor
- [ ] Environment variables configured (see below)
- [ ] VAPID keys generated for push notifications
- [ ] Supabase Storage bucket `uploads` created (if using Supabase Storage)

## Environment Variables

Required:
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
JWT_SECRET=your-jwt-secret-min-32-chars
```

Optional:
```
PORT=3000
CHAT_PASSWORD=optional-global-password
GIPHY_API_KEY=your-giphy-key
VAPID_PUBLIC_KEY=your-vapid-public-key
VAPID_PRIVATE_KEY=your-vapid-private-key
MAX_MSG_RATE=10
ROOM_EXPIRY_DAYS=90
```

## Railway Deployment

1. Push code to GitHub
2. Go to https://railway.app/new
3. Select "Deploy from GitHub repo"
4. Choose your whispr repo
5. Add environment variables in Railway dashboard
6. Deploy — Railway auto-detects `Procfile` and `railway.toml`

## Render Deployment

1. Push code to GitHub
2. Go to https://render.com/blueprints
3. Click "New Blueprint"
4. Connect repo and select `render.yaml`
5. Add environment variables
6. Deploy

## Docker Deployment

```bash
docker build -t whispr .
docker run -d -p 3000:3000 \
  -e SUPABASE_URL=https://... \
  -e SUPABASE_SERVICE_ROLE_KEY=... \
  -e JWT_SECRET=... \
  whispr
```

## Post-Deployment Verification

1. **Health check**: `curl https://your-domain.com/api/health`
2. **Register test user**: POST to `/api/auth/register`
3. **Login**: POST to `/api/auth/login`
4. **Send message**: Connect via Socket.io, join room, send message
5. **Check presence**: Verify `user_presence` table updates
6. **Test push**: Allow notifications, send message from another device

## Database Verification

In Supabase SQL Editor, run:

```sql
-- Verify tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('users', 'rooms', 'messages', 'room_participants', 'user_presence', 'user_blocks', 'user_sessions', 'media');

-- Verify indexes
SELECT indexname FROM pg_indexes WHERE tablename IN ('messages', 'rooms', 'room_participants');

-- Test presence cleanup
SELECT COUNT(*) FROM user_presence WHERE last_heartbeat < (EXTRACT(EPOCH FROM NOW()) * 1000) - 60000;
```

## Scaling Considerations

- **Free tier limits**: Railway/Render free tier sleeps after 15min inactivity
- **Socket.io sticky sessions**: Not needed for single instance
- **Supabase connection pooling**: Enable in Supabase dashboard for production
- **File uploads**: Supabase Storage free tier: 1GB storage, 2GB bandwidth

## Troubleshooting

**Socket won't connect**: Check CORS settings in `server.js`, ensure `io.origins` includes your domain.

**Messages not persisting**: Verify `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set. Check Supabase logs for RLS errors.

**Push notifications failing**: Ensure VAPID keys are set, service worker is registered, and user granted permission.

**Uploads failing**: Check `uploads` bucket exists in Supabase Storage, or verify local `data/uploads/` directory is writable.
