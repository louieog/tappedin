# Supabase Setup Instructions for TappedIn Chat

## 1. Create Supabase Project

1. Go to https://supabase.com and sign up/login
2. Click "New Project"
3. Name it "tappedin-chat" (or your preferred name)
4. Choose a region close to your users
5. Wait for the project to be created

## 2. Get Your API Keys

Once your project is ready:

1. Go to Project Settings → API
2. Copy these values:
   - **Project URL** (e.g., `https://abcdefgh12345678.supabase.co`)
   - **anon public** API key (starts with `eyJ...`)

## 3. Create the Messages Table

Go to the SQL Editor and run:

```sql
-- Create messages table
CREATE TABLE messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  text TEXT NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  type TEXT DEFAULT 'message' CHECK (type IN ('message', 'system'))
);

-- Enable Row Level Security
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all reads
CREATE POLICY "Allow all reads" ON messages
  FOR SELECT USING (true);

-- Create policy to allow all inserts
CREATE POLICY "Allow all inserts" ON messages
  FOR INSERT WITH CHECK (true);

-- Enable realtime for messages table
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
```

## 4. Set Environment Variables in Vercel

Add these environment variables to your Vercel project:

```
VITE_SUPABASE_URL=https://your-project-url.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

To add them:
1. Go to https://vercel.com/louieogs-projects/tapped-in/settings/environment-variables
2. Add both variables
3. Redeploy the project

## 5. Local Development

For local development, create a `.env` file in the project root:

```
VITE_SUPABASE_URL=https://your-project-url.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

Then run:
```bash
npm install
npm run dev
```

## Features Implemented

✅ Real-time message sync across all users
✅ Message persistence (last 100 messages loaded on join)
✅ Presence tracking (shows who's online)
✅ "User joined/left" system messages
✅ Connection status indicator
✅ No passwords required (simple username entry)

## Database Schema

**messages table:**
- `id` (UUID) - Primary key
- `user_id` (TEXT) - User's unique ID
- `username` (TEXT) - Display name
- `text` (TEXT) - Message content
- `timestamp` (TIMESTAMPTZ) - When sent
- `type` (TEXT) - 'message' or 'system'

## Security Notes

- The current setup allows anonymous reads/writes (open chat)
- For production, consider adding rate limiting
- Messages are not encrypted (standard for public chat)
- No user authentication required
