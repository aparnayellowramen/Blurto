// The no-repeat topic queue (FR-2, FR-3, FR-12).
// On first visit every topic ID is shuffled once (Fisher–Yates) into a queue.
// Each draw takes the next ID and records it as used, so a topic never repeats
// on this device. IDs added to the sheet later are shuffled into the remaining
// queue; IDs already used stay used.

export function shuffle(arr, rand = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Rebuild a valid { queue, used } from saved state (or null) and the current topic IDs. */
export function reconcileQueue(saved, allIds, rand = Math.random) {
  const valid = new Set(allIds);
  const used = Array.isArray(saved?.used) ? [...new Set(saved.used.filter(Number.isInteger))] : [];
  const usedSet = new Set(used);
  const inQueue = new Set();
  const queue = [];
  for (const id of Array.isArray(saved?.queue) ? saved.queue : []) {
    if (valid.has(id) && !usedSet.has(id) && !inQueue.has(id)) {
      inQueue.add(id);
      queue.push(id);
    }
  }
  const fresh = allIds.filter((id) => !usedSet.has(id) && !inQueue.has(id));
  return { queue: fresh.length ? shuffle(queue.concat(fresh), rand) : queue, used };
}

/** Take the next topic ID, or null when every topic has been used. Mutates state. */
export function takeNext(state) {
  const id = state.queue.shift();
  if (id === undefined) return null;
  state.used.push(id);
  return id;
}
