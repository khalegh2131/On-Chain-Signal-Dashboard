'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Local-storage-backed state.
 *
 * Reads happen after mount rather than during the first render: the server has
 * no storage, so a value read eagerly would make the server markup and the first
 * client paint disagree. Writes are skipped until that read has landed, so a
 * stored value is never clobbered by the initial default.
 */

/**
 * Decode a stored payload.
 *
 * A missing key and a corrupt value both fall back to the caller's default —
 * storage is shared with older versions of this app and with other tabs, so
 * unparseable content is an expected state rather than an exceptional one.
 * A stored `null` is returned as `null`, because that is a value a caller may
 * legitimately have written.
 */
export function readStoredValue<T>(raw: string | null, fallback: T): T {
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * Encode a value for storage.
 *
 * Returns `null` when the value cannot be represented — a function, a symbol, or
 * a structure with a cycle — which the caller treats as "leave storage alone".
 */
export function writeStoredValue<T>(value: T): string | null {
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? null : serialized;
  } catch {
    return null;
  }
}

/** Read a string from storage without letting a blocked store throw. */
function safeRead(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    // Safari in private mode and hardened privacy settings both throw on access.
    return null;
  }
}

/** Write a string to storage, tolerating a full or blocked store. */
function safeWrite(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // A quota error must not take down the render that triggered the write.
  }
}

export type LocalStorageSetter<T> = (value: T | ((previous: T) => T)) => void;

/**
 * Persist a piece of state in `localStorage`, kept in sync across tabs.
 *
 * The setter accepts an updater function so a caller can derive from the stored
 * value without reading it back first, which is the only safe way to update a
 * value another tab may have changed in the meantime.
 */
export function useLocalStorage<T>(key: string, initialValue: T): [T, LocalStorageSetter<T>] {
  const [stored, setStored] = useState<T>(initialValue);
  const [hydrated, setHydrated] = useState(false);

  // Held in a ref so an inline default object cannot re-trigger the read effect
  // on every render.
  const initialRef = useRef(initialValue);

  useEffect(() => {
    setStored(readStoredValue(safeRead(key), initialRef.current));
    setHydrated(true);
  }, [key]);

  useEffect(() => {
    if (!hydrated) return;
    const serialized = writeStoredValue(stored);
    if (serialized !== null) safeWrite(key, serialized);
  }, [key, stored, hydrated]);

  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      // `key === null` is a full clear, which invalidates every stored value.
      if (event.key !== null && event.key !== key) return;
      setStored(readStoredValue(event.newValue, initialRef.current));
    }

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [key]);

  const setValue = useCallback<LocalStorageSetter<T>>((value) => {
    setStored((previous) =>
      typeof value === 'function' ? (value as (current: T) => T)(previous) : value
    );
  }, []);

  return [stored, setValue];
}
