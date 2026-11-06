/**
 * Stable mount points consumed by the existing header/brand/interaction scripts.
 * Their order and IDs mirror the original #root children exactly.
 */
export function SiteChromeHosts() {
  return (
    <>
      <div id="site-header" />
      <div id="site-brand-header" />
      <div id="site-interaction-bar" />
      <div id="site-share-modal" />
    </>
  );
}
