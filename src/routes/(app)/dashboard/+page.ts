// Dashboard is fully client-rendered — it requires auth and contains
// widgets that use browser APIs (canvas, SpeechRecognition, etc.).
// Disabling SSR keeps all widget components out of the server bundle,
// preventing module-level ReferenceErrors from crashing all routes.
export const ssr = false;
