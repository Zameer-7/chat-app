import { boolean, integer, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  username: text("username").notNull().unique(),
  nickname: text("nickname").notNull().unique(),
  nicknameLastChanged: timestamp("nickname_last_changed"),
  usernameLastChanged: timestamp("username_last_changed"),
  chatTheme: text("chat_theme").notNull().default("light"),
  avatarUrl: text("avatar_url"),
  bio: text("bio"),
  isOnline: boolean("is_online").notNull().default(false),
  emailVerified: boolean("email_verified").notNull().default(false),
  emailOtp: text("email_otp"),
  otpExpiry: timestamp("otp_expiry"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastSeen: timestamp("last_seen").notNull().defaultNow(),
});

export const rooms = pgTable("rooms", {
  id: varchar("id").primaryKey(),
  roomName: text("room_name"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const friendRequests = pgTable("friend_requests", {
  id: serial("id").primaryKey(),
  senderId: integer("sender_id").notNull().references(() => users.id),
  receiverId: integer("receiver_id").notNull().references(() => users.id),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const userRooms = pgTable("user_rooms", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  roomId: varchar("room_id").notNull().references(() => rooms.id),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
  leftAt: timestamp("left_at"),
});

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  roomId: varchar("room_id"),
  senderId: integer("sender_id").notNull().references(() => users.id),
  senderNickname: text("sender_nickname").notNull().default("Unknown"),
  receiverId: integer("receiver_id").references(() => users.id),
  content: text("content").notNull(),
  messageType: text("message_type").notNull().default("text"),
  gifUrl: text("gif_url"),
  replyToId: integer("reply_to_id"),
  status: text("status").notNull().default("sent"),
  deleted: boolean("deleted").notNull().default(false),
  edited: boolean("edited").notNull().default(false),
  editedAt: timestamp("edited_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const messageHidden = pgTable("message_hidden", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id").notNull().references(() => messages.id),
  userId: integer("user_id").notNull().references(() => users.id),
  hiddenAt: timestamp("hidden_at").notNull().defaultNow(),
});

export const messageReactions = pgTable("message_reactions", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id").notNull().references(() => messages.id),
  userId: integer("user_id").notNull().references(() => users.id),
  reaction: text("reaction").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const chatSettings = pgTable("chat_settings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  roomId: varchar("room_id"),
  friendId: integer("friend_id"),
  archived: boolean("archived").notNull().default(false),
  muted: boolean("muted").notNull().default(false),
  muteUntil: timestamp("mute_until"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  type: text("type").notNull(),          // new_message | friend_request | room_invite
  message: text("message").notNull(),
  referenceId: text("reference_id"),      // e.g. friendId, roomId, messageId
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  email: true,
  passwordHash: true,
  nickname: true,
});

export const signupSchema = z.object({
  username: z
    .string()
    .regex(
      /^[a-zA-Z0-9_]{3,20}$/,
      "Username must be 3\u201320 characters and contain only letters, numbers, or underscores.",
    ),
  email: z.string().email(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/, "Password must contain at least one special character"),
  captchaId: z.string().min(1, "Captcha is required"),
  captchaAnswer: z.string().min(1, "Please type the captcha word"),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const sendFriendRequestSchema = z.object({
  receiverId: z.number().int().positive(),
});

export const updateFriendRequestSchema = z.object({
  status: z.enum(["accepted", "rejected"]),
});

export const createRoomMessageSchema = z.object({
  roomId: z.string().min(1),
  content: z.string().min(1),
});

export const createDirectMessageSchema = z.object({
  receiverId: z.number().int().positive(),
  content: z.string().min(1),
});

export const updateProfileSchema = z.object({
  nickname: z.string().min(2).max(25).optional(),
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscore").optional(),
});

export const updateThemeSchema = z.object({
  chatTheme: z.enum(["light", "dark", "ocean", "midnight", "love"]),
});

export const updateProfileMetaSchema = z.object({
  avatarUrl: z.string().max(200000).optional(),
  bio: z.string().max(150).optional(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Room = typeof rooms.$inferSelect;
export type FriendRequest = typeof friendRequests.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
