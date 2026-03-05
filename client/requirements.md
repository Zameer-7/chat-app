## Packages
date-fns | Formatting timestamps for chat messages
framer-motion | Smooth page transitions and chat bubble entrance animations
lucide-react | High quality icons for the UI
clsx | Utility for constructing className strings conditionally
tailwind-merge | Utility to merge tailwind classes without style conflicts

## Notes
- WebSocket expected at `/ws/room/:roomId?username=...`
- The `username` is required and will be stored in `localStorage`
- Chat uses optimistic UI and updates via WebSocket events
- The backend API endpoints are strictly followed via the `@shared/routes` contract
