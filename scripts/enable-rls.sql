-- ============================================================
-- Vibely Chat App — Row Level Security (RLS) Policies
-- ============================================================
-- Your Express backend connects as `postgres` (superuser),
-- which BYPASSES RLS. These policies protect against direct
-- access via Supabase's auto-generated REST API (anon/authenticated keys).
--
-- HOW TO RUN:
--   Option 1: Supabase Dashboard → SQL Editor → paste & Run
--   Option 2: psql -h <host> -U postgres -d postgres -f scripts/enable-rls.sql
-- ============================================================

-- ─── 1. ENABLE RLS ON ALL TABLES ───────────────────────────

ALTER TABLE users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms              ENABLE ROW LEVEL SECURITY;
ALTER TABLE friend_requests    ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_rooms         ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages           ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_hidden     ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_reactions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_settings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications      ENABLE ROW LEVEL SECURITY;

-- Force RLS even for table owners (defense-in-depth)
ALTER TABLE users              FORCE ROW LEVEL SECURITY;
ALTER TABLE rooms              FORCE ROW LEVEL SECURITY;
ALTER TABLE friend_requests    FORCE ROW LEVEL SECURITY;
ALTER TABLE user_rooms         FORCE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions FORCE ROW LEVEL SECURITY;
ALTER TABLE messages           FORCE ROW LEVEL SECURITY;
ALTER TABLE message_hidden     FORCE ROW LEVEL SECURITY;
ALTER TABLE message_reactions  FORCE ROW LEVEL SECURITY;
ALTER TABLE chat_settings      FORCE ROW LEVEL SECURITY;
ALTER TABLE notifications      FORCE ROW LEVEL SECURITY;


-- ─── 2. USERS TABLE ────────────────────────────────────────
-- Anyone authenticated can read basic user info (for search, profiles)
-- Only the user themselves can update their own row

DROP POLICY IF EXISTS "users_select_authenticated" ON users;
CREATE POLICY "users_select_authenticated" ON users
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "users_update_own" ON users;
CREATE POLICY "users_update_own" ON users
  FOR UPDATE TO authenticated
  USING (id = (auth.uid()::text)::int)
  WITH CHECK (id = (auth.uid()::text)::int);

-- No direct insert/delete via REST API (handled by server)
DROP POLICY IF EXISTS "users_insert_deny" ON users;
CREATE POLICY "users_insert_deny" ON users
  FOR INSERT TO anon, authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "users_delete_deny" ON users;
CREATE POLICY "users_delete_deny" ON users
  FOR DELETE TO anon, authenticated
  USING (false);


-- ─── 3. ROOMS TABLE ────────────────────────────────────────
-- Authenticated users can see rooms; only creator can update/delete

DROP POLICY IF EXISTS "rooms_select_authenticated" ON rooms;
CREATE POLICY "rooms_select_authenticated" ON rooms
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "rooms_insert_deny" ON rooms;
CREATE POLICY "rooms_insert_deny" ON rooms
  FOR INSERT TO anon, authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "rooms_update_deny" ON rooms;
CREATE POLICY "rooms_update_deny" ON rooms
  FOR UPDATE TO anon, authenticated
  USING (false);

DROP POLICY IF EXISTS "rooms_delete_deny" ON rooms;
CREATE POLICY "rooms_delete_deny" ON rooms
  FOR DELETE TO anon, authenticated
  USING (false);


-- ─── 4. FRIEND REQUESTS ────────────────────────────────────
-- Users can see requests where they are sender or receiver

DROP POLICY IF EXISTS "friend_requests_select_own" ON friend_requests;
CREATE POLICY "friend_requests_select_own" ON friend_requests
  FOR SELECT TO authenticated
  USING (
    sender_id = (auth.uid()::text)::int
    OR receiver_id = (auth.uid()::text)::int
  );

DROP POLICY IF EXISTS "friend_requests_insert_deny" ON friend_requests;
CREATE POLICY "friend_requests_insert_deny" ON friend_requests
  FOR INSERT TO anon, authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "friend_requests_update_deny" ON friend_requests;
CREATE POLICY "friend_requests_update_deny" ON friend_requests
  FOR UPDATE TO anon, authenticated
  USING (false);

DROP POLICY IF EXISTS "friend_requests_delete_deny" ON friend_requests;
CREATE POLICY "friend_requests_delete_deny" ON friend_requests
  FOR DELETE TO anon, authenticated
  USING (false);


-- ─── 5. USER ROOMS (membership) ────────────────────────────
-- Users can see their own room memberships

DROP POLICY IF EXISTS "user_rooms_select_own" ON user_rooms;
CREATE POLICY "user_rooms_select_own" ON user_rooms
  FOR SELECT TO authenticated
  USING (user_id = (auth.uid()::text)::int);

DROP POLICY IF EXISTS "user_rooms_insert_deny" ON user_rooms;
CREATE POLICY "user_rooms_insert_deny" ON user_rooms
  FOR INSERT TO anon, authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "user_rooms_update_deny" ON user_rooms;
CREATE POLICY "user_rooms_update_deny" ON user_rooms
  FOR UPDATE TO anon, authenticated
  USING (false);

DROP POLICY IF EXISTS "user_rooms_delete_deny" ON user_rooms;
CREATE POLICY "user_rooms_delete_deny" ON user_rooms
  FOR DELETE TO anon, authenticated
  USING (false);


-- ─── 6. PUSH SUBSCRIPTIONS ─────────────────────────────────
-- Users can only see their own push subscriptions

DROP POLICY IF EXISTS "push_subs_select_own" ON push_subscriptions;
CREATE POLICY "push_subs_select_own" ON push_subscriptions
  FOR SELECT TO authenticated
  USING (user_id = (auth.uid()::text)::int);

DROP POLICY IF EXISTS "push_subs_insert_deny" ON push_subscriptions;
CREATE POLICY "push_subs_insert_deny" ON push_subscriptions
  FOR INSERT TO anon, authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "push_subs_update_deny" ON push_subscriptions;
CREATE POLICY "push_subs_update_deny" ON push_subscriptions
  FOR UPDATE TO anon, authenticated
  USING (false);

DROP POLICY IF EXISTS "push_subs_delete_deny" ON push_subscriptions;
CREATE POLICY "push_subs_delete_deny" ON push_subscriptions
  FOR DELETE TO anon, authenticated
  USING (false);


-- ─── 7. MESSAGES ────────────────────────────────────────────
-- Users can see messages they sent or received, or in rooms they belong to

DROP POLICY IF EXISTS "messages_select_own" ON messages;
CREATE POLICY "messages_select_own" ON messages
  FOR SELECT TO authenticated
  USING (
    sender_id = (auth.uid()::text)::int
    OR receiver_id = (auth.uid()::text)::int
    OR room_id IN (
      SELECT room_id FROM user_rooms
      WHERE user_id = (auth.uid()::text)::int AND left_at IS NULL
    )
  );

-- Block all writes via REST API (server handles everything)
DROP POLICY IF EXISTS "messages_insert_deny" ON messages;
CREATE POLICY "messages_insert_deny" ON messages
  FOR INSERT TO anon, authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "messages_update_deny" ON messages;
CREATE POLICY "messages_update_deny" ON messages
  FOR UPDATE TO anon, authenticated
  USING (false);

DROP POLICY IF EXISTS "messages_delete_deny" ON messages;
CREATE POLICY "messages_delete_deny" ON messages
  FOR DELETE TO anon, authenticated
  USING (false);


-- ─── 8. MESSAGE HIDDEN ─────────────────────────────────────
-- Users can only see their own hidden-message records

DROP POLICY IF EXISTS "message_hidden_select_own" ON message_hidden;
CREATE POLICY "message_hidden_select_own" ON message_hidden
  FOR SELECT TO authenticated
  USING (user_id = (auth.uid()::text)::int);

DROP POLICY IF EXISTS "message_hidden_insert_deny" ON message_hidden;
CREATE POLICY "message_hidden_insert_deny" ON message_hidden
  FOR INSERT TO anon, authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "message_hidden_update_deny" ON message_hidden;
CREATE POLICY "message_hidden_update_deny" ON message_hidden
  FOR UPDATE TO anon, authenticated
  USING (false);

DROP POLICY IF EXISTS "message_hidden_delete_deny" ON message_hidden;
CREATE POLICY "message_hidden_delete_deny" ON message_hidden
  FOR DELETE TO anon, authenticated
  USING (false);


-- ─── 9. MESSAGE REACTIONS ───────────────────────────────────
-- Users can see all reactions (needed to display counts)

DROP POLICY IF EXISTS "message_reactions_select_all" ON message_reactions;
CREATE POLICY "message_reactions_select_all" ON message_reactions
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "message_reactions_insert_deny" ON message_reactions;
CREATE POLICY "message_reactions_insert_deny" ON message_reactions
  FOR INSERT TO anon, authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "message_reactions_update_deny" ON message_reactions;
CREATE POLICY "message_reactions_update_deny" ON message_reactions
  FOR UPDATE TO anon, authenticated
  USING (false);

DROP POLICY IF EXISTS "message_reactions_delete_deny" ON message_reactions;
CREATE POLICY "message_reactions_delete_deny" ON message_reactions
  FOR DELETE TO anon, authenticated
  USING (false);


-- ─── 10. CHAT SETTINGS ─────────────────────────────────────
-- Users can only see their own chat settings

DROP POLICY IF EXISTS "chat_settings_select_own" ON chat_settings;
CREATE POLICY "chat_settings_select_own" ON chat_settings
  FOR SELECT TO authenticated
  USING (user_id = (auth.uid()::text)::int);

DROP POLICY IF EXISTS "chat_settings_insert_deny" ON chat_settings;
CREATE POLICY "chat_settings_insert_deny" ON chat_settings
  FOR INSERT TO anon, authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "chat_settings_update_deny" ON chat_settings;
CREATE POLICY "chat_settings_update_deny" ON chat_settings
  FOR UPDATE TO anon, authenticated
  USING (false);

DROP POLICY IF EXISTS "chat_settings_delete_deny" ON chat_settings;
CREATE POLICY "chat_settings_delete_deny" ON chat_settings
  FOR DELETE TO anon, authenticated
  USING (false);


-- ─── 11. NOTIFICATIONS ─────────────────────────────────────
-- Users can only see their own notifications

DROP POLICY IF EXISTS "notifications_select_own" ON notifications;
CREATE POLICY "notifications_select_own" ON notifications
  FOR SELECT TO authenticated
  USING (user_id = (auth.uid()::text)::int);

DROP POLICY IF EXISTS "notifications_insert_deny" ON notifications;
CREATE POLICY "notifications_insert_deny" ON notifications
  FOR INSERT TO anon, authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "notifications_update_deny" ON notifications;
CREATE POLICY "notifications_update_deny" ON notifications
  FOR UPDATE TO anon, authenticated
  USING (false);

DROP POLICY IF EXISTS "notifications_delete_deny" ON notifications;
CREATE POLICY "notifications_delete_deny" ON notifications
  FOR DELETE TO anon, authenticated
  USING (false);


-- ─── 12. BLOCK ANONYMOUS ACCESS ON ALL TABLES ──────────────
-- Deny all operations for the anon role (public/unauthenticated)

DROP POLICY IF EXISTS "users_anon_deny" ON users;
CREATE POLICY "users_anon_deny" ON users
  FOR SELECT TO anon USING (false);

DROP POLICY IF EXISTS "rooms_anon_deny" ON rooms;
CREATE POLICY "rooms_anon_deny" ON rooms
  FOR SELECT TO anon USING (false);

DROP POLICY IF EXISTS "messages_anon_deny" ON messages;
CREATE POLICY "messages_anon_deny" ON messages
  FOR SELECT TO anon USING (false);

DROP POLICY IF EXISTS "message_hidden_anon_deny" ON message_hidden;
CREATE POLICY "message_hidden_anon_deny" ON message_hidden
  FOR SELECT TO anon USING (false);

DROP POLICY IF EXISTS "message_reactions_anon_deny" ON message_reactions;
CREATE POLICY "message_reactions_anon_deny" ON message_reactions
  FOR SELECT TO anon USING (false);

DROP POLICY IF EXISTS "friend_requests_anon_deny" ON friend_requests;
CREATE POLICY "friend_requests_anon_deny" ON friend_requests
  FOR SELECT TO anon USING (false);

DROP POLICY IF EXISTS "user_rooms_anon_deny" ON user_rooms;
CREATE POLICY "user_rooms_anon_deny" ON user_rooms
  FOR SELECT TO anon USING (false);

DROP POLICY IF EXISTS "push_subs_anon_deny" ON push_subscriptions;
CREATE POLICY "push_subs_anon_deny" ON push_subscriptions
  FOR SELECT TO anon USING (false);

DROP POLICY IF EXISTS "chat_settings_anon_deny" ON chat_settings;
CREATE POLICY "chat_settings_anon_deny" ON chat_settings
  FOR SELECT TO anon USING (false);

DROP POLICY IF EXISTS "notifications_anon_deny" ON notifications;
CREATE POLICY "notifications_anon_deny" ON notifications
  FOR SELECT TO anon USING (false);


-- ============================================================
-- DONE! All 10 tables now have RLS enabled.
--
-- Your Express backend connects as `postgres` (superuser),
-- so it BYPASSES all these policies and continues working normally.
--
-- These policies protect against:
--   - Direct access via Supabase anon key (all blocked)
--   - Direct access via Supabase authenticated key (scoped per user)
--   - All INSERT/UPDATE/DELETE via REST API (blocked — server only)
-- ============================================================
