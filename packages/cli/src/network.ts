import { EnvHttpProxyAgent } from 'undici';
import type { FetchLike } from '@socratica/core';

/** Node 20's native fetch does not read proxy environment variables on its own. */
export function networkFetch(env: NodeJS.ProcessEnv): FetchLike {
  let dispatcher: EnvHttpProxyAgent | undefined;
  return async (url, init) => {
    const httpProxy = env.http_proxy || env.HTTP_PROXY;
    const httpsProxy = env.https_proxy || env.HTTPS_PROXY;
    if (!dispatcher && (httpProxy || httpsProxy)) {
      try {
        dispatcher = new EnvHttpProxyAgent({ httpProxy, httpsProxy, noProxy: env.no_proxy ?? env.NO_PROXY ?? '' });
      } catch {
        // Invalid proxy URLs may contain credentials. Do not expose the original exception.
        throw new Error('Invalid HTTP(S)_PROXY configuration. Check your proxy settings.');
      }
    }
    return fetch(url, { ...(init as RequestInit), ...(dispatcher ? { dispatcher } : {}) });
  };
}
