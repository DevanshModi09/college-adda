import type { FocusTimer, TimerMode } from '@adda/shared';

// One shared pomodoro per room. Pure state machine; the hub broadcasts results.

const DURATION: Record<TimerMode, number> = { focus: 25 * 60, break: 5 * 60 };
type State = Omit<FocusTimer, 'serverNow'>;

const timers = new Map<string, State>();
const fresh = (mode: TimerMode = 'focus'): State => ({ mode, duration: DURATION[mode], remaining: DURATION[mode], endsAt: null });

export type TimerAction = { action: 'start' | 'pause' | 'reset' } | { action: 'mode'; mode: TimerMode };

export const roomTimers = {
  get(roomId: string): FocusTimer {
    const t = timers.get(roomId) ?? fresh();
    // A finished timer reads as stopped at zero.
    if (t.endsAt && t.endsAt <= Date.now()) Object.assign(t, { endsAt: null, remaining: 0 });
    timers.set(roomId, t);
    return { ...t, serverNow: Date.now() };
  },

  apply(roomId: string, cmd: TimerAction): FocusTimer {
    const t = { ...this.get(roomId) };
    const now = Date.now();
    switch (cmd.action) {
      case 'start':
        if (!t.endsAt) t.endsAt = now + (t.remaining > 0 ? t.remaining : t.duration) * 1000;
        break;
      case 'pause':
        if (t.endsAt) {
          t.remaining = Math.max(0, Math.round((t.endsAt - now) / 1000));
          t.endsAt = null;
        }
        break;
      case 'reset':
        Object.assign(t, fresh(t.mode));
        break;
      case 'mode':
        Object.assign(t, fresh(cmd.mode));
        break;
    }
    const { serverNow: _, ...state } = t;
    timers.set(roomId, state);
    return { ...state, serverNow: now };
  },

  drop: (roomId: string) => void timers.delete(roomId),
};
