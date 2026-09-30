import { create } from 'zustand';
import type { RoomWithMembers } from '@adda/shared';

interface LiveState {
  connected: boolean;
  online: Set<string>;
  rooms: RoomWithMembers[] | null;
  /** Partner id of the chat thread currently on screen. */
  activeChat: string | null;
  setConnected: (v: boolean) => void;
  setOnline: (ids: string[]) => void;
  setPresence: (id: string, online: boolean) => void;
  setRooms: (rooms: RoomWithMembers[]) => void;
  setActiveChat: (id: string | null) => void;
  reset: () => void;
}

export const useLive = create<LiveState>((set) => ({
  connected: false,
  online: new Set(),
  rooms: null,
  activeChat: null,
  setConnected: (connected) => set({ connected }),
  setOnline: (ids) => set({ online: new Set(ids) }),
  setPresence: (id, isOnline) =>
    set((s) => {
      const online = new Set(s.online);
      if (isOnline) online.add(id);
      else online.delete(id);
      return { online };
    }),
  setRooms: (rooms) => set({ rooms }),
  setActiveChat: (activeChat) => set({ activeChat }),
  reset: () => set({ connected: false, online: new Set(), rooms: null, activeChat: null }),
}));

export const useIsOnline = (id: string | undefined) => useLive((s) => (id ? s.online.has(id) : false));
