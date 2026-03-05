import { z } from 'zod';
import { insertRoomSchema, insertMessageSchema, rooms, messages } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  rooms: {
    create: {
      method: 'POST' as const,
      path: '/api/rooms' as const,
      input: z.object({ id: z.string().optional() }).optional(),
      responses: {
        201: z.custom<typeof rooms.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/rooms/:id' as const,
      responses: {
        200: z.custom<typeof rooms.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    messages: {
      list: {
        method: 'GET' as const,
        path: '/api/rooms/:id/messages' as const,
        responses: {
          200: z.array(z.custom<typeof messages.$inferSelect>()),
          404: errorSchemas.notFound,
        },
      },
    }
  },
};

export const ws = {
  send: {
    message: z.object({ content: z.string() }),
  },
  receive: {
    message: z.custom<typeof messages.$inferSelect>(),
    system: z.object({ content: z.string(), type: z.string() }),
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}

export type RoomResponse = z.infer<typeof api.rooms.create.responses[201]>;
export type MessageResponse = z.infer<typeof api.rooms.messages.list.responses[200]>[0];
