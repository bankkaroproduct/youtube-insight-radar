

# Fix: Maximum Update Depth Error on Links Page

## Problem
`linkProcessingService.getState()` returns a **new object reference** on every call (`{ running, logs }`). `useSyncExternalStore` uses `Object.is` to compare snapshots — since a new object is never `===` to the previous one, React re-renders infinitely.

## Fix

**File: `src/services/linkProcessingService.ts`**

Cache the state object and only create a new one when `running` or `logs` actually change:

```typescript
private snapshot = { running: false as boolean, logs: [] as LogEntry[] };

getState() {
  return this.snapshot;
}

private notify() {
  this.snapshot = { running: this.running, logs: this.logs };
  this.listeners.forEach((fn) => fn());
}
```

This ensures `getState()` returns the same reference between notifications, which is exactly what `useSyncExternalStore` requires.

