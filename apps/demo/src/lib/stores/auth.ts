import { writable } from 'svelte/store';

export type AuthMethod = 'nip07' | 'nip46' | null;

export interface AuthState {
  method: AuthMethod;
  pubkey: string | null;
}

export const authStore = writable<AuthState>({
  method: null,
  pubkey: null,
});
