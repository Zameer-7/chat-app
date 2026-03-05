import { db } from "./db";
import { rooms, messages } from "@shared/schema";
import type { InsertRoom, Room, InsertMessage, Message } from "@shared/schema";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";

export interface IStorage {
  createRoom(): Promise<Room>;
  getRoom(id: string): Promise<Room | undefined>;
  getRoomMessages(roomId: string): Promise<Message[]>;
  createMessage(msg: InsertMessage): Promise<Message>;
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
}

export const storage = new DatabaseStorage();
