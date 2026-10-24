// Loaded by every package's Vitest config: any accidental real network call fails the test.
const blocked = () => {
  throw new Error('Network access is disabled in tests. Inject a fake FetchLike instead.');
};
globalThis.fetch = blocked as unknown as typeof fetch;
