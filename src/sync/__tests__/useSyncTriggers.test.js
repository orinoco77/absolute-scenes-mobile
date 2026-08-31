// src/sync/__tests__/useSyncTriggers.test.js
import { vi, test, expect, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSyncTriggers } from '../useSyncTriggers.js';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test('fires once immediately when enabled', () => {
  const triggerSync = vi.fn();
  renderHook(() => useSyncTriggers(triggerSync, { enabled: true }));
  expect(triggerSync).toHaveBeenCalledTimes(1);
});

test('does not fire when disabled', () => {
  const triggerSync = vi.fn();
  renderHook(() => useSyncTriggers(triggerSync, { enabled: false }));
  expect(triggerSync).not.toHaveBeenCalled();
});

test('fires on visibilitychange', () => {
  const triggerSync = vi.fn();
  renderHook(() => useSyncTriggers(triggerSync, { enabled: true }));
  triggerSync.mockClear();
  document.dispatchEvent(new Event('visibilitychange'));
  expect(triggerSync).toHaveBeenCalledTimes(1);
});

test('fires on the online event', () => {
  const triggerSync = vi.fn();
  renderHook(() => useSyncTriggers(triggerSync, { enabled: true }));
  triggerSync.mockClear();
  window.dispatchEvent(new Event('online'));
  expect(triggerSync).toHaveBeenCalledTimes(1);
});

test('the periodic tick only fires while the document is visible', () => {
  vi.useFakeTimers();
  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
  const triggerSync = vi.fn();
  renderHook(() => useSyncTriggers(triggerSync, { enabled: true }));
  triggerSync.mockClear();
  vi.advanceTimersByTime(2 * 60 * 1000);
  expect(triggerSync).not.toHaveBeenCalled();

  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  vi.advanceTimersByTime(2 * 60 * 1000);
  expect(triggerSync).toHaveBeenCalledTimes(1);
});

test('cleans up listeners and the interval on unmount', () => {
  vi.useFakeTimers();
  const triggerSync = vi.fn();
  const { unmount } = renderHook(() => useSyncTriggers(triggerSync, { enabled: true }));
  unmount();
  triggerSync.mockClear();
  document.dispatchEvent(new Event('visibilitychange'));
  window.dispatchEvent(new Event('online'));
  vi.advanceTimersByTime(2 * 60 * 1000);
  expect(triggerSync).not.toHaveBeenCalled();
});
