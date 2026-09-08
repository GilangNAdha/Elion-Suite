// index.html establishes the app's asset base before any module executes.
// Never resolve a bundled asset relative to /workspace/:id/edit.
export function assetUrl(path: string): string {
  return new URL(path.replace(/^\/+/, ''), document.baseURI).href
}
