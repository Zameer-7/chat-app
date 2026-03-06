import { repository } from "./models/repository";

// Backward-compatible facade kept to avoid import breakage.
export const storage = repository;
