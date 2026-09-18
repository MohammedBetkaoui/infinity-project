// Registration contract served by this build (build-time feature flag).
//
//   VITE_AIVEX_FORM_VERSION unset or '3' -> form v3 (production, legacy)
//   VITE_AIVEX_FORM_VERSION = '4'         -> form v4 (canonical contract)
//
// Keep production on 3 until the v4 write path is deployed (Phase 2): until
// then the API validates a v4 registration and answers 503 without storing
// anything. Read statically so Vite inlines this one variable only.
export const REGISTER_FORM_VERSION = import.meta.env.VITE_AIVEX_FORM_VERSION === '4' ? 4 : 3
