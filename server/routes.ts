import type { Express } from "express";
import type { Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { parse } from "url";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  app.post(api.rooms.create.path, async (req, res) => {
    try {
      const room = await storage.createRoom();
      res.status(201).json(room);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.get(api.rooms.get.path, async (req, res) => {
    const room = await storage.getRoom(req.params.id);
    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }
    res.json(room);
  });

  app.get(api.rooms.messages.list.path, async (req, res) => {
    const room = await storage.getRoom(req.params.id);
    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }
    const msgs = await storage.getRoomMessages(req.params.id);
    res.json(msgs);
  });

  // Set up WebSocket server for real-time messaging
  const wss = new WebSocketServer({ noServer: true });
  const clients = new Map<string, Set<{ws: WebSocket, username: string}>>();
  const globalClients = new Map<string, WebSocket>();

  httpServer.on('upgrade', (request, socket, head) => {
    const { pathname, query } = parse(request.url || '', true);
    
    // Check if it's our room websocket endpoint
    const match = pathname?.match(/^\/ws\/room\/([^/]+)$/);
    if (match) {
      const roomId = match[1];
      const username = Array.isArray(query.username) ? query.username[0] : (query.username || 'Anonymous');
      
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request, roomId, username);
      });
    }
  });

  wss.on('connection', async (ws, request, roomId: string, username: string) => {
    if (!clients.has(roomId)) {
      clients.set(roomId, new Set());
    }
    const roomClients = clients.get(roomId)!;
    const clientState = { ws, username };
    roomClients.add(clientState);
    globalClients.set(username, ws);

    // Mark user as online
    await storage.updateUserStatus(username, true);

    // Broadcast user joined & presence
    const presenceMsg = JSON.stringify({
        type: 'user_status',
        userId: username,
        status: 'online'
    });
    
    // Broadcast to everyone (simplified for presence)
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(presenceMsg);
      }
    });

    ws.on('message', async (data) => {
      try {
        const parsed = JSON.parse(data.toString());
        if (parsed.type === 'message' && parsed.content) {
            const savedMsg = await storage.createMessage({
                roomId,
                username,
                content: parsed.content
            });
            
            const outMsg = JSON.stringify({
                type: 'message',
                ...savedMsg
            });
            roomClients.forEach(client => {
                if (client.ws.readyState === WebSocket.OPEN) {
                    client.ws.send(outMsg);
                }
            });
        } else if (parsed.type === 'typing_start' || parsed.type === 'typing_stop') {
            const typingMsg = JSON.stringify({
                type: parsed.type,
                roomId,
                userId: username
            });
            roomClients.forEach(client => {
                if (client.ws !== ws && client.ws.readyState === WebSocket.OPEN) {
                    client.ws.send(typingMsg);
                }
            });
        }
      } catch (e) {
        console.error('Invalid message format', e);
      }
    });

    ws.on('close', async () => {
        roomClients.delete(clientState);
        globalClients.delete(username);
        
        await storage.updateUserStatus(username, false);

        const presenceMsg = JSON.stringify({
            type: 'user_status',
            userId: username,
            status: 'offline',
            lastSeen: new Date().toISOString()
        });

        wss.clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(presenceMsg);
          }
        });

        if (roomClients.size === 0) {
            clients.delete(roomId);
        }
    });
  });

  return httpServer;
}
