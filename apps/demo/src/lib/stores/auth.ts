import { writable } from 'svelte/store';

export type AuthMethod = 'nip07' | 'nip46' | null;
export type SessionStatus = 'idle' | 'connecting' | 'connected' | 'error' | 'disconnected';

export interface AuthState {
  method: AuthMethod;
  pubkey: string | null;
  sessionStatus: SessionStatus;
  sessionInfo: string | null;
}

export const authStore = writable<AuthState>({
  method: null,
  pubkey: null,
  sessionStatus: 'idle',
  sessionInfo: null,
});
