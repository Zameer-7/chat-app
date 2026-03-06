import type { Express } from "express";
import type { Server } from "http";
import { registerAuthRoutes } from "./routes/auth";
import { registerDirectMessageRoutes } from "./routes/direct";
import { registerFriendRoutes } from "./routes/friends";
import { registerMessageRoutes } from "./routes/messages";
import { registerProfileRoutes } from "./routes/profile";
import { registerRoomRoutes } from "./routes/rooms";
import { registerSettingsRoutes } from "./routes/settings";
import { registerUserRoutes } from "./routes/users";
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

  registerAuthRoutes(app);
  registerUserRoutes(app);
  registerProfileRoutes(app);
  registerSettingsRoutes(app);
  registerFriendRoutes(app);
  registerRoomRoutes(app);
  registerDirectMessageRoutes(app);
  registerMessageRoutes(app);

  registerWebSocket(httpServer);

  return httpServer;
}
