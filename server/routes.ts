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
    // We intentionally don't destroy the socket for other paths because
    // Vite needs the upgrade event for HMR (Hot Module Replacement)
  });

  wss.on('connection', (ws, request, roomId: string, username: string) => {
    if (!clients.has(roomId)) {
      clients.set(roomId, new Set());
    }
    const roomClients = clients.get(roomId)!;
    const clientState = { ws, username };
    roomClients.add(clientState);

    // Broadcast user joined
    const joinMsg = JSON.stringify({
        type: 'system',
        content: `${username} has joined the chat`
    });
    roomClients.forEach(client => {
        if (client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(joinMsg);
        }
    });

    ws.on('message', async (data) => {
      try {
        const parsed = JSON.parse(data.toString());
        if (parsed.type === 'message' && parsed.content) {
            // Save to DB
            const savedMsg = await storage.createMessage({
                roomId,
                username,
                content: parsed.content
            });
            
            // Broadcast to all clients in room
            const outMsg = JSON.stringify({
                type: 'message',
                ...savedMsg
            });
            roomClients.forEach(client => {
                if (client.ws.readyState === WebSocket.OPEN) {
                    client.ws.send(outMsg);
                }
            });
        }
      } catch (e) {
        console.error('Invalid message format', e);
      }
    });

    ws.on('close', () => {
        roomClients.delete(clientState);
        if (roomClients.size === 0) {
            clients.delete(roomId);
        } else {
            // Broadcast user left
            const leaveMsg = JSON.stringify({
                type: 'system',
                content: `${username} has left the chat`
            });
            roomClients.forEach(client => {
                if (client.ws.readyState === WebSocket.OPEN) {
                    client.ws.send(leaveMsg);
                }
            });
        }
    });
  });

  return httpServer;
}
