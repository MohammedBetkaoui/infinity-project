// Retired: the full scene (orbit, scroll depth, reveal) now runs on every
// viewport exactly like desktop, so there is no separate mobile choreography
// to install. Kept as a no-op so the AivexPage call site stays untouched and
// the history of the mobile variant remains visible.
export default function useAivexMobileMotion() {}
