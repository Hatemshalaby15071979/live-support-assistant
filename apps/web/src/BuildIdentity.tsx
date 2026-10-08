import { useEffect, useState } from 'react';

interface BuildIdentityInfo {
  readonly project: string;
  readonly sha: string;
  readonly shortSha: string;
  readonly branch: string;
  readonly dirty: boolean | 'unknown';
  readonly builtAt: string;
}

declare global {
  interface Window {
    __BUILD_IDENTITY?: BuildIdentityInfo;
  }
}

/** Displays the exact build identity served with this web app. */
export function BuildIdentity() {
  const [identity, setIdentity] = useState<BuildIdentityInfo | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let active = true;

    fetch('/build-identity.json', { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<BuildIdentityInfo>;
      })
      .then((value) => {
        if (!active) return;
        window.__BUILD_IDENTITY = value;
        setIdentity(value);
      })
      .catch(() => {
        if (active) setUnavailable(true);
      });

    return () => {
      active = false;
    };
  }, []);

  if (unavailable) {
    return <p className="mt-2 text-xs text-gray-500" data-build-identity="unavailable">Build identity unavailable</p>;
  }

  if (!identity) {
    return <p className="mt-2 text-xs text-gray-500" data-build-identity="loading">Loading build identity…</p>;
  }

  const builtAt = new Date(identity.builtAt).toISOString();
  const dirty = identity.dirty === true ? 'dirty' : identity.dirty === false ? 'clean' : 'dirty state unknown';

  return (
    <p
      className="mt-2 text-xs text-gray-500"
      data-build-identity="ready"
      title={`${identity.project} · ${identity.branch} · ${identity.sha} · ${builtAt} · ${dirty}`}
    >
      Build <code>{identity.shortSha}</code> · {identity.branch} · {builtAt} · {dirty}
    </p>
  );
}
