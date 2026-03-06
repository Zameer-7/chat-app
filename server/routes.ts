import type { Express } from "express";
import type { Server } from "http";
import { registerAuthRoutes } from "./routes/auth";
import { registerDirectMessageRoutes } from "./routes/direct";
import { registerFriendRoutes } from "./routes/friends";
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
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_messages_room_id ON messages(room_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_messages_room_created ON messages(room_id, created_at)`);

  registerAuthRoutes(app);
  registerUserRoutes(app);
  registerProfileRoutes(app);
  registerSettingsRoutes(app);
  registerFriendRoutes(app);
  registerRoomRoutes(app);
  registerDirectMessageRoutes(app);

  registerWebSocket(httpServer);

  return httpServer;
}
