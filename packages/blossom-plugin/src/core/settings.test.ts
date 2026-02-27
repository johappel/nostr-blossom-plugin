// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  loadSettingsFromLocalStorage,
  saveSettingsToLocalStorage,
  mergeWithSettings,
  mergeLocalAndRemote,
  type BlossomUserSettings,
} from './settings';

// ── localStorage tests ────────────────────────────────────────────────────────

describe('loadSettingsFromLocalStorage', () => {
  beforeEach(() => localStorage.clear());

  it('returns empty object when nothing stored', () => {
    expect(loadSettingsFromLocalStorage()).toEqual({});
  });

  it('returns parsed settings', () => {
    const settings: BlossomUserSettings = {
      bunkerUri: 'bunker://abc?relay=wss://r.example.com',
      servers: ['https://s1.example.com'],
    };
    localStorage.setItem('blossom-settings:default', JSON.stringify(settings));
    expect(loadSettingsFromLocalStorage()).toEqual(settings);
  });

  it('returns empty object on invalid JSON', () => {
    localStorage.setItem('blossom-settings:default', '{broken');
    expect(loadSettingsFromLocalStorage()).toEqual({});
  });

  it('uses appId for scoping', () => {
    const a: BlossomUserSettings = { servers: ['https://a.example.com'] };
    const b: BlossomUserSettings = { servers: ['https://b.example.com'] };
    localStorage.setItem('blossom-settings:app-a', JSON.stringify(a));
    localStorage.setItem('blossom-settings:app-b', JSON.stringify(b));
    expect(loadSettingsFromLocalStorage('app-a')).toEqual(a);
    expect(loadSettingsFromLocalStorage('app-b')).toEqual(b);
  });
});

describe('saveSettingsToLocalStorage', () => {
  beforeEach(() => localStorage.clear());

  it('writes settings with updatedAt', () => {
    const settings: BlossomUserSettings = { servers: ['https://s.example.com'] };
    saveSettingsToLocalStorage(settings, 'default');
    const stored = JSON.parse(localStorage.getItem('blossom-settings:default')!);
    expect(stored.servers).toEqual(['https://s.example.com']);
    expect(typeof stored.updatedAt).toBe('number');
    expect(stored.updatedAt).toBeGreaterThan(0);
  });
});

// ── mergeWithSettings ─────────────────────────────────────────────────────────

describe('mergeWithSettings', () => {
  const hostServers = ['https://host.example.com'];
  const hostRelay = 'wss://host-relay.example.com';
  const hostVision = 'https://host-vision.example.com';

  it('returns host values when settings are empty', () => {
    const result = mergeWithSettings(hostServers, hostRelay, hostVision, {});
    expect(result).toEqual({
      servers: hostServers,
      relayUrls: [hostRelay],
      visionEndpoint: hostVision,
    });
  });

  it('overrides servers when user has non-empty list', () => {
    const result = mergeWithSettings(hostServers, hostRelay, hostVision, {
      servers: ['https://user.example.com'],
    });
    expect(result.servers).toEqual(['https://user.example.com']);
    expect(result.relayUrls).toEqual([hostRelay]);
  });

  it('ignores empty user servers array', () => {
    const result = mergeWithSettings(hostServers, hostRelay, hostVision, {
      servers: [],
    });
    expect(result.servers).toEqual(hostServers);
  });

  it('uses all user relays for relayUrls', () => {
    const result = mergeWithSettings(hostServers, hostRelay, hostVision, {
      relays: ['wss://user-relay.example.com', 'wss://user-relay2.example.com'],
    });
    expect(result.relayUrls).toEqual(['wss://user-relay.example.com', 'wss://user-relay2.example.com']);
  });

  it('overrides visionEndpoint', () => {
    const result = mergeWithSettings(hostServers, hostRelay, hostVision, {
      visionEndpoint: 'https://user-vision.example.com',
    });
    expect(result.visionEndpoint).toBe('https://user-vision.example.com');
  });

  it('ignores blank visionEndpoint', () => {
    const result = mergeWithSettings(hostServers, hostRelay, hostVision, {
      visionEndpoint: '   ',
    });
    expect(result.visionEndpoint).toBe(hostVision);
  });

  it('handles all overrides simultaneously', () => {
    const result = mergeWithSettings(hostServers, hostRelay, hostVision, {
      servers: ['https://u.example.com'],
      relays: ['wss://u-relay.example.com'],
      visionEndpoint: 'https://u-vision.example.com',
    });
    expect(result).toEqual({
      servers: ['https://u.example.com'],
      relayUrls: ['wss://u-relay.example.com'],
      visionEndpoint: 'https://u-vision.example.com',
    });
  });
});

// ── mergeLocalAndRemote ───────────────────────────────────────────────────────

describe('mergeLocalAndRemote', () => {
  it('keeps local when remote is older', () => {
    const local: BlossomUserSettings = { servers: ['https://local.example.com'], updatedAt: 2000 };
    const remote: BlossomUserSettings = { servers: ['https://remote.example.com'] };
    const result = mergeLocalAndRemote(local, remote, 1);
    expect(result.servers).toEqual(['https://local.example.com']);
  });

  it('uses remote when remote is newer', () => {
    const local: BlossomUserSettings = { servers: ['https://local.example.com'], updatedAt: 500 };
    const remote: BlossomUserSettings = { servers: ['https://remote.example.com'] };
    const result = mergeLocalAndRemote(local, remote, 2);
    expect(result.servers).toEqual(['https://remote.example.com']);
    // updatedAt should be remoteTs in ms
    expect(result.updatedAt).toBe(2000);
  });
});
