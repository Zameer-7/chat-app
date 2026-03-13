import type { Express } from "express";
import type { Server } from "http";
import { registerAuthRoutes } from "./routes/auth";
import { registerDirectMessageRoutes } from "./routes/direct";
import { registerFriendRoutes } from "./routes/friends";
import { registerMessageRoutes } from "./routes/messages";
import { registerProfileRoutes } from "./routes/profile";
import { registerPushRoutes } from "./routes/push";
import { registerRoomRoutes } from "./routes/rooms";
import { registerSettingsRoutes } from "./routes/settings";
import { registerUserRoutes } from "./routes/users";
import { registerChatSettingsRoutes } from "./routes/chat-settings";
import { registerNotificationRoutes } from "./routes/notifications";
import { registerWebSocket } from "./websocket";
import { pool } from "./db";

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  // Auto-migrate: add any new columns if they don't exist yet
  await pool.query(`ALTER TABLE rooms ADD COLUMN IF NOT EXISTS room_name TEXT`);
  await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_id INT`);
  await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited BOOLEAN NOT NULL DEFAULT false`);
  await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_messages_room_id ON messages(room_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_messages_room_created ON messages(room_id, created_at)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, endpoint)
    )
  `);
  // Ensure unique constraints exist for username and email
  await pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'users_username_unique' AND conrelid = 'users'::regclass
      ) THEN
        ALTER TABLE users ADD CONSTRAINT users_username_unique UNIQUE(username);
      END IF;
    END; $$;
  `);
  // Chat settings table for archive & mute per-user per-chat
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_settings (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      room_id VARCHAR,
      friend_id INT,
      archived BOOLEAN NOT NULL DEFAULT false,
      muted BOOLEAN NOT NULL DEFAULT false,
      mute_until TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_settings_user_room ON chat_settings(user_id, room_id) WHERE room_id IS NOT NULL`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_settings_user_friend ON chat_settings(user_id, friend_id) WHERE friend_id IS NOT NULL`);

  // Email verification columns
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_otp TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_expiry TIMESTAMP`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_path TEXT`);
  await pool.query(`UPDATE users SET avatar_path = avatar_url WHERE avatar_path IS NULL AND avatar_url LIKE '/uploads/%'`);
  // Mark all existing users as verified so they can still log in
  await pool.query(`UPDATE users SET email_verified = true WHERE email_verified = false AND email_otp IS NULL AND created_at < NOW() - INTERVAL '1 minute'`);

  // Performance indexes for scalability
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_online ON users(is_online)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_friend_requests_receiver ON friend_requests(receiver_id, status)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_friend_requests_sender ON friend_requests(sender_id, status)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_rooms_user ON user_rooms(user_id)`);
  // Composite index for DM queries (sender + receiver)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_messages_sender_receiver ON messages(sender_id, receiver_id)`);
  // Index for receiver_id (used in unread counts and DM fetches)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id)`);
  // Index for message reactions lookup
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_message_reactions_message ON message_reactions(message_id)`);
  // Index for message_hidden lookup
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_message_hidden_user ON message_hidden(message_id, user_id)`);

  // Notifications table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      reference_id TEXT,
      is_read BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read, created_at DESC)`);

  // Password resets table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_resets (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reset_code TEXT NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id)`);
  registerAuthRoutes(app);
  registerUserRoutes(app);
  registerProfileRoutes(app);
  registerSettingsRoutes(app);
  registerFriendRoutes(app);
  registerRoomRoutes(app);
  registerDirectMessageRoutes(app);
  registerMessageRoutes(app);
  registerChatSettingsRoutes(app);
  registerNotificationRoutes(app);
  registerPushRoutes(app);

  registerWebSocket(httpServer);

  return httpServer;
}
