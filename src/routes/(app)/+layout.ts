// Disable SSR for all authenticated routes.
// These pages require client-side auth (Supabase localStorage tokens)
// which aren't available during server-side rendering — causing 500 errors on page refresh.
export const ssr = false;
