import { describe, expect, it, vi } from 'vitest';
import { networkFetch } from '../network.js';

describe('proxy configuration errors', () => {
  it('does not leak proxy credentials when a configured proxy URL is invalid', async () => {
    const request = networkFetch({ HTTPS_PROXY: 'https://user:test-proxy-password@' });
    await expect(request('https://public-source.org/data')).rejects.toThrow('Invalid HTTP(S)_PROXY configuration.');
    await expect(request('https://public-source.org/data')).rejects.not.toThrow('test-proxy-password');
  });

  it('does not make a request when proxy configuration cannot be used', async () => {
    const original = globalThis.fetch;
    const fetch = vi.fn();
    globalThis.fetch = fetch;
    try {
      await expect(networkFetch({ HTTP_PROXY: 'http://user:password@' })('https://public-source.org/data')).rejects.toThrow('Check your proxy settings.');
      expect(fetch).not.toHaveBeenCalled();
    } finally { globalThis.fetch = original; }
  });
});
