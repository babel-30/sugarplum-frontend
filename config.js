// config.js
// ===============================
// Detect if we're running locally
// ===============================
const isLocalHost =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1";

// ===============================
// Backend base URL
// - Local dev  -> http://127.0.0.1:3000
// - Deployed   -> your Render backend URL
//   (replace the placeholder below)
// ===============================

// ⬇️ REPLACE this with your actual Render backend URL
//    Example: "https://spc-backend.onrender.com"
const RENDER_BACKEND_BASE = "https://YOUR-RENDER-BACKEND-URL.onrender.com";

// This is what the rest of the site will use:
const API_BASE = isLocalHost
  ? "http://127.0.0.1:3000"
  : RENDER_BACKEND_BASE;

// Optional: small debug helper in the browser console
console.log("[SPC] Using API_BASE =", API_BASE);
