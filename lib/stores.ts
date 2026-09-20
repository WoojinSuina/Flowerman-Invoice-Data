// Store naming convention: if the printed NAME line ends in "CON" (often
// with a leading marker like "*CON", "**CON", or "#CON"), the store is
// consignment — the products on this invoice were actually delivered the
// prior cycle, and this invoice is collecting money for those, not for
// what's physically on the page. Otherwise ("regular"), the money on this
// invoice is for what's on this invoice, no lag.
//
// Confirmed against real store data: the "CON" marker always lands at the
// end of the address half of the printed NAME line, never the chain-name
// half — that's just how the line happens to end before extraction splits
// it into storeName/storeAddress, not a meaningful distinction, so both
// fields are checked here.
export function isConsignmentStore(store: { name: string; address: string | null }): boolean {
  if (/CON$/i.test(store.name.trim())) return true;
  return store.address != null && /CON$/i.test(store.address.trim());
}
