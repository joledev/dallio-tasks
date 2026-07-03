// Deterministic date format (fixed locale + UTC) so the SSR and client renders match — a
// locale-dependent `toLocaleDateString()` would risk a hydration mismatch. Shared by the task
// table (md+) and the mobile task card list so both surfaces read one format.
const dateFmt = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' });

export const formatDate = (iso: string) => dateFmt.format(new Date(iso));
