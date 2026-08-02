export async function registerInstallableShell() {
  if (
    !('serviceWorker' in navigator) ||
    !['http:', 'https:'].includes(location.protocol)
  ) {
    return null;
  }
  const workerUrl = new URL(
    '../../service-worker.js',
    import.meta.url,
  );
  return navigator.serviceWorker.register(workerUrl, {
    scope: new URL('../../', import.meta.url).pathname,
    updateViaCache: 'none',
  });
}

void registerInstallableShell().catch(() => {
  // Installation is an optional platform surface. A failed registration must
  // never pause, resume, mutate, or replace the authoritative game Worker.
});
