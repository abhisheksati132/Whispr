# 🚀 Supabase Setup Guide for Whispr

**Whispr** is fully configured to use **Supabase (PostgreSQL)** for all user accounts, room data, real-time messaging history, notes, and media.

Follow these 3 simple steps to connect your Supabase project:

---

### Step 1: Create a Free Project on Supabase
1. Go to [supabase.com](https://supabase.com) and log in or create a free account.
2. Click **New project**, choose an organization, give your project a name (e.g. `bestie-chat`), and set a secure database password.
3. Choose your nearest region (e.g. `West US`, `Central EU`, `South Asia`, etc.) and click **Create new project**.

---

### Step 2: Run the Database Schema (1-Click)
1. In your Supabase Dashboard, click on the **SQL Editor** tab on the left sidebar (icon looks like `>_` or SQL terminal).
2. Click **New query**.
3. Open the [`supabase_schema.sql`](./supabase_schema.sql) file from this repository, copy its entire contents, and paste it into the SQL Editor.
4. Click the green **Run** button (or press `Ctrl + Enter` / `Cmd + Enter`).
5. You should see `Success. No rows returned` — all 5 tables (`users`, `rooms`, `messages`, `push_subs`, `media`) and indexes are now created!

---

### Step 3: Add Your Supabase Keys to Environment Variables
1. In your Supabase Dashboard, click on **Project Settings** (gear icon at the bottom of the left sidebar).
2. Click **API** under Configuration.
3. Copy the following two values:
   - **Project URL** (e.g. `https://xxxxxxxxxxxx.supabase.co`)
   - **service_role secret** key (Click *Reveal* under `Project API keys` -> `service_role`).
     *(Note: You can also use the `anon public` key if preferred, but `service_role` is recommended for backend servers).*
4. In your hosting provider (such as **Render**, **Railway**, or your local `.env` file), add these environment variables:

```env
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJh...your-service-role-key...
```

---

### Step 4: Verification
When your server starts up, it will output:
```
=============================================
🔄 Checking Supabase connection...
✅ Supabase (PostgreSQL) connected successfully!
=============================================
```
And `/api/health` will report:
```json
{
  "status": "ok",
  "database": "supabase",
  "supabase": true
}
```

*Note: If you run the app without environment variables, it automatically runs in resilient in-memory mode so you can test locally anytime!*
