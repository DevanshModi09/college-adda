import { create } from 'zustand';

export type ToastKind = 'info' | 'good' | 'bad' | 'warn';

export interface Toast {
  id: number;
  text: string;
  kind: ToastKind;
  href?: string;
}

interface ToastState {
  toasts: Toast[];
  push: (text: string, opts?: { kind?: ToastKind; href?: string }) => void;
  dismiss: (id: number) => void;
}

let seq = 0;

export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: (text, opts = {}) => {
    const id = ++seq;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, kind: opts.kind ?? 'info', href: opts.href }] }));
    setTimeout(() => get().dismiss(id), 4500);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const toast = (text: string, opts?: { kind?: ToastKind; href?: string }) => useToasts.getState().push(text, opts);
