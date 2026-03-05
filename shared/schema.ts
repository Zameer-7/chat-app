import { pgTable, text, serial, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const rooms = pgTable("rooms", {
  id: varchar("id").primaryKey(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  roomId: varchar("room_id").notNull(),
  username: text("username").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertRoomSchema = createInsertSchema(rooms).pick({ id: true });
export const insertMessageSchema = createInsertSchema(messages).pick({ roomId: true, username: true, content: true });

export type Room = typeof rooms.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type InsertRoom = z.infer<typeof insertRoomSchema>;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
