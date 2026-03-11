import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

export interface AuthPayload {
  userId: number;
  email: string;
  username: string;
}

export interface AuthedRequest extends Request {
  user?: AuthPayload;
}

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

/** Sign a short-lived access token (15 min) */
export function signAccessToken(payload: AuthPayload) {
  return jwt.sign({ ...payload, type: "access" }, JWT_SECRET, { expiresIn: "15m" });
}

/** Sign a long-lived refresh token (7 days) */
export function signRefreshToken(payload: AuthPayload) {
  return jwt.sign({ ...payload, type: "refresh" }, JWT_SECRET, { expiresIn: "7d" });
}

/** @deprecated Use signAccessToken instead */
export const signToken = signAccessToken;

/** Verify an access token (rejects refresh tokens) */
export function verifyToken(token: string): AuthPayload {
  const decoded = jwt.verify(token, JWT_SECRET) as AuthPayload & { type?: string };
  if (decoded.type === "refresh") {
    throw new Error("Refresh token cannot be used as access token");
  }
  return { userId: decoded.userId, email: decoded.email, username: decoded.username };
}

/** Verify a refresh token */
export function verifyRefreshToken(token: string): AuthPayload {
  const decoded = jwt.verify(token, JWT_SECRET) as AuthPayload & { type?: string };
  if (decoded.type !== "refresh") {
    throw new Error("Not a refresh token");
  }
  return { userId: decoded.userId, email: decoded.email, username: decoded.username };
}

export function authMiddleware(req: AuthedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;

  if (!token) {
    return res.status(401).json({ message: "Missing auth token" });
  }

  try {
    req.user = verifyToken(token);
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}
