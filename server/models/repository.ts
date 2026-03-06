import { and, eq, ilike, ne, or, sql } from "drizzle-orm";
import { db } from "../db";
import { friendRequests, messageHidden, messageReactions, messages, rooms, userRooms, users } from "@shared/schema";

const CHANGE_COOLDOWN_DAYS = 14;

export type SafeUser = {
  id: number;
  email: string;
  username: string;
  nickname: string;
  avatarUrl: string | null;
  bio: string | null;
  chatTheme: "light" | "dark" | "ocean" | "midnight" | "love";
  nicknameLastChanged: Date | null;
  usernameLastChanged: Date | null;
  createdAt: Date;
  isOnline: boolean;
  lastSeen: Date;
};

function toSafeUser(user: typeof users.$inferSelect): SafeUser {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    nickname: user.nickname,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    chatTheme: user.chatTheme as SafeUser["chatTheme"],
    nicknameLastChanged: user.nicknameLastChanged,
    usernameLastChanged: user.usernameLastChanged,
    createdAt: user.createdAt,
    isOnline: user.isOnline,
    lastSeen: user.lastSeen,
  };
}

function getDaysRemaining(lastChanged: Date | null) {
  if (!lastChanged) return 0;
  const elapsedMs = Date.now() - new Date(lastChanged).getTime();
  const elapsedDays = elapsedMs / (1000 * 60 * 60 * 24);
  if (elapsedDays >= CHANGE_COOLDOWN_DAYS) return 0;
  return Math.ceil(CHANGE_COOLDOWN_DAYS - elapsedDays);
}

export const repository = {
  async createUser(data: { email: string; passwordHash: string; nickname: string; username: string }) {
    const [user] = await db.insert(users).values(data).returning();
    return toSafeUser(user);
  },

  async getUserByEmail(email: string) {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  },

  async getUserById(id: number) {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user ? toSafeUser(user) : undefined;
  },

  async getRawUserById(id: number) {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  },

  async getUserByUsername(username: string) {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  },

  async searchUsersByUsername(currentUserId: number, q: string) {
    const term = `%${q}%`;
    const rows = await db
      .select()
      .from(users)
      .where(and(ne(users.id, currentUserId), ilike(users.username, term)))
      .orderBy(users.username)
      .limit(20);

    return rows.map(toSafeUser);
  },

  async setUserOnlineStatus(userId: number, isOnline: boolean) {
    await db
      .update(users)
      .set({ isOnline, lastSeen: new Date() })
      .where(eq(users.id, userId));
  },

  async updateTheme(userId: number, chatTheme: SafeUser["chatTheme"]) {
    const [updated] = await db
      .update(users)
      .set({ chatTheme })
      .where(eq(users.id, userId))
      .returning();

    return updated ? toSafeUser(updated) : null;
  },

  async updateProfile(userId: number, payload: { nickname?: string; username?: string }) {
    const [current] = await db.select().from(users).where(eq(users.id, userId));
    if (!current) return null;

    const updates: Partial<typeof users.$inferInsert> = {};

    if (payload.nickname && payload.nickname !== current.nickname) {
      const remaining = getDaysRemaining(current.nicknameLastChanged);
      if (remaining > 0) {
        throw new Error(`You can change your nickname again in ${remaining} days.`);
      }

      const [existingNick] = await db.select().from(users).where(eq(users.nickname, payload.nickname));
      if (existingNick) {
        throw new Error("Nickname already taken");
      }

      updates.nickname = payload.nickname;
      updates.nicknameLastChanged = new Date();
    }

    if (payload.username && payload.username !== current.username) {
      const remaining = getDaysRemaining(current.usernameLastChanged);
      if (remaining > 0) {
        throw new Error(`You can change your username again in ${remaining} days.`);
      }

      const [existingUsername] = await db.select().from(users).where(eq(users.username, payload.username));
      if (existingUsername) {
        throw new Error("Username already taken");
      }

      updates.username = payload.username;
      updates.usernameLastChanged = new Date();
    }

    if (!Object.keys(updates).length) {
      return toSafeUser(current);
    }

    const [updated] = await db.update(users).set(updates).where(eq(users.id, userId)).returning();
    return toSafeUser(updated);
  },

  async updateProfileMeta(userId: number, payload: { avatarUrl?: string; bio?: string }) {
    const updates: Partial<typeof users.$inferInsert> = {};
    if (payload.avatarUrl !== undefined) updates.avatarUrl = payload.avatarUrl || null;
    if (payload.bio !== undefined) updates.bio = payload.bio || null;

    const [updated] = await db.update(users).set(updates).where(eq(users.id, userId)).returning();
    return updated ? toSafeUser(updated) : null;
  },

  async getProfileOverview(userId: number) {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) return null;

    const friendResult = await db.execute(sql`
      select count(*)::int as "friendCount"
      from friend_requests fr
      where (fr.sender_id = ${userId} or fr.receiver_id = ${userId}) and fr.status = 'accepted'
    `);

    const roomResult = await db.execute(sql`
      select count(distinct room_id)::int as "roomCount"
      from messages
      where sender_id = ${userId} and room_id is not null
    `);

    const friendAgg = friendResult.rows[0] as { friendCount: number } | undefined;
    const roomAgg = roomResult.rows[0] as { roomCount: number } | undefined;

    return {
      ...toSafeUser(user),
      friendCount: friendAgg?.friendCount ?? 0,
      roomCount: roomAgg?.roomCount ?? 0,
    };
  },

  async createRoom(createdBy: number, roomName?: string) {
    const id = Math.random().toString(36).slice(2, 10);
    const name = roomName?.trim() || "Chat Room";
    const [room] = await db.insert(rooms).values({ id, roomName: name, createdBy }).returning();
    return room;
  },

  async getRoom(id: string) {
    const result = await db.execute(sql`
      select r.id, r.room_name as "roomName", r.created_by as "createdBy", r.created_at as "createdAt",
             u.nickname as "creatorNickname", u.username as "creatorUsername"
      from rooms r
      left join users u on u.id = r.created_by
      where r.id = ${id}
    `);
    return result.rows[0] as { id: string; roomName: string | null; createdBy: number | null; createdAt: string; creatorNickname: string | null; creatorUsername: string | null } | undefined;
  },

  async renameRoom(roomId: string, requestingUserId: number, newName: string) {
    const result = await db.execute(sql`select id, created_by as "createdBy" from rooms where id = ${roomId}`);
    const room = result.rows[0] as { id: string; createdBy: number | null } | undefined;
    if (!room) throw Object.assign(new Error("Room not found"), { status: 404 });
    if (room.createdBy !== requestingUserId) throw Object.assign(new Error("Only the room owner can rename this room"), { status: 403 });
    const trimmed = newName.trim().slice(0, 50) || "Chat Room";
    await db.update(rooms).set({ roomName: trimmed }).where(eq(rooms.id, roomId));
    return { id: roomId, roomName: trimmed };
  },

  async getRoomMembers(roomId: string) {
    return db.execute(sql`
      select ur.user_id as "userId", ur.joined_at as "joinedAt", ur.left_at as "leftAt",
             u.nickname, u.username, u.avatar_url as "avatarUrl", u.is_online as "isOnline",
             r.created_by as "createdBy"
      from user_rooms ur
      join users u on u.id = ur.user_id
      join rooms r on r.id = ur.room_id
      where ur.room_id = ${roomId}
      order by ur.joined_at asc
    `);
  },

  async deleteRoom(roomId: string, requestingUserId: number) {
    const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));
    if (!room) throw Object.assign(new Error("Room not found"), { status: 404 });
    if (room.createdBy !== requestingUserId) throw Object.assign(new Error("Only the room creator can delete this room"), { status: 403 });

    await db.execute(sql`DELETE FROM message_reactions mr USING messages m WHERE mr.message_id = m.id AND m.room_id = ${roomId}`);
    await db.execute(sql`DELETE FROM message_hidden mh USING messages m WHERE mh.message_id = m.id AND m.room_id = ${roomId}`);
    await db.execute(sql`DELETE FROM messages WHERE room_id = ${roomId}`);
    await db.execute(sql`DELETE FROM user_rooms WHERE room_id = ${roomId}`);
    await db.delete(rooms).where(eq(rooms.id, roomId));
    return true;
  },

  async joinRoom(userId: number, roomId: string) {
    const [existing] = await db
      .select()
      .from(userRooms)
      .where(and(eq(userRooms.userId, userId), eq(userRooms.roomId, roomId)))
      .orderBy(sql`${userRooms.joinedAt} desc`);

    if (existing && !existing.leftAt) {
      return existing;
    }

    if (existing && existing.leftAt) {
      const [rejoined] = await db
        .update(userRooms)
        .set({ leftAt: null })
        .where(eq(userRooms.id, existing.id))
        .returning();
      return rejoined;
    }

    const [joined] = await db.insert(userRooms).values({ userId, roomId }).returning();
    return joined;
  },

  async leaveRoom(userId: number, roomId: string) {
    const [left] = await db
      .update(userRooms)
      .set({ leftAt: new Date() })
      .where(and(eq(userRooms.userId, userId), eq(userRooms.roomId, roomId), sql`${userRooms.leftAt} is null`))
      .returning();
    return left;
  },

  async isActiveRoomMember(userId: number, roomId: string) {
    const [membership] = await db
      .select()
      .from(userRooms)
      .where(and(eq(userRooms.userId, userId), eq(userRooms.roomId, roomId), sql`${userRooms.leftAt} is null`));
    return Boolean(membership);
  },

  async isRoomMember(userId: number, roomId: string) {
    const [membership] = await db
      .select()
      .from(userRooms)
      .where(and(eq(userRooms.userId, userId), eq(userRooms.roomId, roomId)));
    return Boolean(membership);
  },

  async getJoinedRooms(userId: number) {
    return db.execute(sql`
      select ur.room_id as "roomId", ur.joined_at as "joinedAt", ur.left_at as "leftAt",
             r.created_at as "roomCreatedAt", r.created_by as "createdBy",
             r.room_name as "roomName"
      from user_rooms ur
      join rooms r on r.id = ur.room_id
      where ur.user_id = ${userId}
      order by ur.joined_at desc
    `);
  },

  async getRoomStats(roomId: string) {
    const participantsResult = await db.execute(sql`
      select array_remove(array_agg(distinct sender_id), null) as "participantIds",
             count(distinct sender_id)::int as "participants"
      from messages
      where room_id = ${roomId}
    `);
    const row = participantsResult.rows[0] as { participantIds: number[] | null; participants: number } | undefined;
    return { participantIds: row?.participantIds || [], participants: row?.participants || 0 };
  },

  async getRoomMessages(roomId: string, viewerId?: number, before?: string, limit = 30) {
    return db.execute(sql`
      select m.id, m.room_id as "roomId", m.sender_id as "senderId", m.sender_nickname as "senderNickname", m.receiver_id as "receiverId",
             m.content, m.message_type as "messageType", m.gif_url as "gifUrl", m.status, m.created_at as "createdAt",
             m.deleted, m.reply_to_id as "replyToId",
             rm.content as "replyToContent", rm.sender_nickname as "replyToNickname",
             coalesce(r.reactions, '[]'::json) as "reactions"
      from messages m
      left join messages rm on rm.id = m.reply_to_id
      left join lateral (
        select json_agg(json_build_object('reaction', mr.reaction, 'count', mr.count)) as reactions
        from (
          select reaction, count(*)::int as count
          from message_reactions
          where message_id = m.id
          group by reaction
        ) mr
      ) r on true
      where m.room_id = ${roomId}
        and (${viewerId ?? null}::int is null or not exists (
          select 1 from message_hidden mh where mh.message_id = m.id and mh.user_id = ${viewerId ?? null}::int
        ))
        and (${before ?? null}::timestamptz is null or m.created_at < ${before ?? null}::timestamptz)
      order by m.created_at desc
      limit ${limit}
    `);
  },

  async createRoomMessage(data: { roomId: string; senderId: number; content?: string; messageType?: "text" | "gif" | "image"; gifUrl?: string | null; replyToId?: number | null }) {
    const [sender] = await db.select({ nickname: users.nickname }).from(users).where(eq(users.id, data.senderId));
    const nickname = sender?.nickname ?? "Unknown";

    const [msg] = await db
      .insert(messages)
      .values({
        roomId: data.roomId,
        senderId: data.senderId,
        senderNickname: nickname,
        content: data.content || "",
        messageType: data.messageType || "text",
        gifUrl: data.gifUrl || null,
        replyToId: data.replyToId || null,
        status: "sent",
      })
      .returning();

    // Fetch reply info if replying
    let replyToContent: string | null = null;
    let replyToNickname: string | null = null;
    if (msg.replyToId) {
      const [replied] = await db.select({ content: messages.content, senderNickname: messages.senderNickname }).from(messages).where(eq(messages.id, msg.replyToId));
      if (replied) {
        replyToContent = replied.content;
        replyToNickname = replied.senderNickname;
      }
    }

    return { ...msg, replyToContent, replyToNickname };
  },

  async markRoomMessagesSeen(roomId: string, viewerId: number) {
    return db.execute(sql`
      update messages
      set status = 'seen'
      where room_id = ${roomId}
        and sender_id != ${viewerId}
        and status != 'seen'
      returning id, sender_id as "senderId"
    `);
  },

  async createFriendRequest(senderId: number, receiverId: number) {
    const [pending] = await db
      .select({ id: friendRequests.id })
      .from(friendRequests)
      .where(and(eq(friendRequests.senderId, senderId), eq(friendRequests.receiverId, receiverId), eq(friendRequests.status, "pending")));

    if (pending) throw new Error("Friend request already sent");

    const [accepted] = await db
      .select({ id: friendRequests.id })
      .from(friendRequests)
      .where(
        and(
          or(
            and(eq(friendRequests.senderId, senderId), eq(friendRequests.receiverId, receiverId)),
            and(eq(friendRequests.senderId, receiverId), eq(friendRequests.receiverId, senderId)),
          ),
          eq(friendRequests.status, "accepted"),
        ),
      );

    if (accepted) throw new Error("You are already friends");

    const [request] = await db.insert(friendRequests).values({ senderId, receiverId, status: "pending" }).returning();
    return request;
  },

  async listIncomingFriendRequests(userId: number) {
    return db.execute(sql`
      select fr.id, fr.sender_id as "senderId", fr.receiver_id as "receiverId", fr.status, fr.created_at as "createdAt",
             u.nickname as "senderNickname", u.username as "senderUsername", u.email as "senderEmail", u.avatar_url as "senderAvatarUrl"
      from friend_requests fr
      join users u on u.id = fr.sender_id
      where fr.receiver_id = ${userId} and fr.status = 'pending'
      order by fr.created_at desc
    `);
  },

  async updateFriendRequestStatus(requestId: number, userId: number, status: "accepted" | "rejected") {
    const [req] = await db
      .select()
      .from(friendRequests)
      .where(and(eq(friendRequests.id, requestId), eq(friendRequests.receiverId, userId), eq(friendRequests.status, "pending")));

    if (!req) return null;

    const [updated] = await db.update(friendRequests).set({ status }).where(eq(friendRequests.id, requestId)).returning();
    return updated;
  },

  async listFriends(userId: number) {
    return db.execute(sql`
      select u.id, u.email, u.username, u.nickname, u.avatar_url as "avatarUrl", u.bio, u.chat_theme as "chatTheme",
             u.nickname_last_changed as "nicknameLastChanged", u.username_last_changed as "usernameLastChanged",
             u.created_at as "createdAt", u.is_online as "isOnline", u.last_seen as "lastSeen"
      from friend_requests fr
      join users u on u.id = case when fr.sender_id = ${userId} then fr.receiver_id else fr.sender_id end
      where (fr.sender_id = ${userId} or fr.receiver_id = ${userId}) and fr.status = 'accepted'
      order by u.nickname asc
    `);
  },

  async areFriends(userId: number, otherUserId: number) {
    const [row] = await db
      .select()
      .from(friendRequests)
      .where(
        and(
          or(
            and(eq(friendRequests.senderId, userId), eq(friendRequests.receiverId, otherUserId)),
            and(eq(friendRequests.senderId, otherUserId), eq(friendRequests.receiverId, userId)),
          ),
          eq(friendRequests.status, "accepted"),
        ),
      );

    return Boolean(row);
  },

  async createDirectMessage(senderId: number, receiverId: number, content?: string, messageType: "text" | "gif" | "image" = "text", gifUrl?: string | null, replyToId?: number | null) {
    const [sender] = await db.select({ nickname: users.nickname }).from(users).where(eq(users.id, senderId));
    const nickname = sender?.nickname ?? "Unknown";

    const [msg] = await db
      .insert(messages)
      .values({ senderId, receiverId, senderNickname: nickname, content: content || "", messageType, gifUrl: gifUrl || null, replyToId: replyToId || null, status: "sent" })
      .returning();

    let replyToContent: string | null = null;
    let replyToNickname: string | null = null;
    if (msg.replyToId) {
      const [replied] = await db
        .select({ content: messages.content, senderNickname: messages.senderNickname })
        .from(messages)
        .where(eq(messages.id, msg.replyToId));
      if (replied) {
        replyToContent = replied.content;
        replyToNickname = replied.senderNickname;
      }
    }

    return { ...msg, replyToContent, replyToNickname };
  },

  async listDirectMessages(userId: number, friendId: number) {
    return db.execute(sql`
      select m.id, m.room_id as "roomId", m.sender_id as "senderId", m.sender_nickname as "senderNickname", m.receiver_id as "receiverId",
             m.content, m.message_type as "messageType", m.gif_url as "gifUrl", m.status, m.created_at as "createdAt",
             m.deleted, m.reply_to_id as "replyToId",
             rm.content as "replyToContent", rm.sender_nickname as "replyToNickname",
             coalesce(r.reactions, '[]'::json) as "reactions"
      from messages m
      left join messages rm on rm.id = m.reply_to_id
      left join lateral (
        select json_agg(json_build_object('reaction', mr.reaction, 'count', mr.count)) as reactions
        from (
          select reaction, count(*)::int as count
          from message_reactions
          where message_id = m.id
          group by reaction
        ) mr
      ) r on true
      where ((m.sender_id = ${userId} and m.receiver_id = ${friendId})
         or (m.sender_id = ${friendId} and m.receiver_id = ${userId}))
        and not exists (
          select 1 from message_hidden mh where mh.message_id = m.id and mh.user_id = ${userId}
        )
      order by m.created_at asc
    `);
  },

  async markDirectMessagesSeen(viewerId: number, friendId: number) {
    return db.execute(sql`
      update messages
      set status = 'seen'
      where sender_id = ${friendId}
        and receiver_id = ${viewerId}
        and status != 'seen'
      returning id, sender_id as "senderId", receiver_id as "receiverId"
    `);
  },

  async updateMessageStatus(messageId: number, status: "sent" | "delivered" | "seen") {
    await db.update(messages).set({ status }).where(eq(messages.id, messageId));
  },

  async addOrUpdateReaction(messageId: number, userId: number, reaction: string) {
    const [existing] = await db
      .select()
      .from(messageReactions)
      .where(and(eq(messageReactions.messageId, messageId), eq(messageReactions.userId, userId)));

    if (existing) {
      const [updated] = await db
        .update(messageReactions)
        .set({ reaction, createdAt: new Date() })
        .where(eq(messageReactions.id, existing.id))
        .returning();
      return updated;
    }

    const [created] = await db.insert(messageReactions).values({ messageId, userId, reaction }).returning();
    return created;
  },

  async getMessageReactions(messageId: number) {
    return db.execute(sql`
      select message_id as "messageId", reaction, count(*)::int as "count"
      from message_reactions
      where message_id = ${messageId}
      group by message_id, reaction
    `);
  },

  async getMessageById(messageId: number) {
    const [msg] = await db.select().from(messages).where(eq(messages.id, messageId));
    return msg;
  },

  async deleteMessageForMe(messageId: number, userId: number) {
    const [existing] = await db
      .select()
      .from(messageHidden)
      .where(and(eq(messageHidden.messageId, messageId), eq(messageHidden.userId, userId)));

    if (existing) return existing;

    const [hidden] = await db.insert(messageHidden).values({ messageId, userId }).returning();
    return hidden;
  },

  async deleteMessageForEveryone(messageId: number, userId: number) {
    const [msg] = await db.select().from(messages).where(eq(messages.id, messageId));
    if (!msg) return null;
    if (msg.senderId !== userId) {
      throw new Error("Only sender can delete for everyone");
    }

    const [updated] = await db
      .update(messages)
      .set({ deleted: true, content: "This message was deleted", gifUrl: null, messageType: "text" })
      .where(eq(messages.id, messageId))
      .returning();
    return updated;
  },
};
