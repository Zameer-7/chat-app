import { db } from "./db";
import { rooms, messages, users } from "@shared/schema";
import type { InsertRoom, Room, InsertMessage, Message, User, InsertUser } from "@shared/schema";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";

export interface IStorage {
  createRoom(): Promise<Room>;
  getRoom(id: string): Promise<Room | undefined>;
  getRoomMessages(roomId: string): Promise<Message[]>;
  createMessage(msg: InsertMessage): Promise<Message>;
  
  updateUserStatus(username: string, isOnline: boolean): Promise<User>;
  getUser(username: string): Promise<User | undefined>;
}

export class DatabaseStorage implements IStorage {
  async createRoom(): Promise<Room> {
    const id = randomBytes(4).toString("hex");
    const [room] = await db.insert(rooms).values({ id }).returning();
    return room;
  }

  async getRoom(id: string): Promise<Room | undefined> {
    const [room] = await db.select().from(rooms).where(eq(rooms.id, id));
    return room;
  }

  async getRoomMessages(roomId: string): Promise<Message[]> {
    return await db.select().from(messages).where(eq(messages.roomId, roomId)).orderBy(messages.createdAt);
  }

  async createMessage(msg: InsertMessage): Promise<Message> {
    const [message] = await db.insert(messages).values(msg).returning();
    return message;
  }

  async updateUserStatus(username: string, isOnline: boolean): Promise<User> {
    const [existing] = await db.select().from(users).where(eq(users.username, username));
    if (existing) {
      const [updated] = await db.update(users)
        .set({ isOnline, lastSeen: new Date() })
        .where(eq(users.username, username))
        .returning();
      return updated;
    } else {
      const [user] = await db.insert(users)
        .values({ username, isOnline, lastSeen: new Date() })
        .returning();
      return user;
    }
  }

  async getUser(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }
}

export const storage = new DatabaseStorage();
