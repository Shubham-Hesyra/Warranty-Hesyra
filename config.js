// Deployment settings for the warranty portal. This is the only file that
// changes between environments.
window.HESYRA_CONFIG = Object.freeze({
  // Google Apps Script web app URL (Deploy → Manage deployments → Web app URL).
  apiUrl: 'https://script.google.com/macros/s/AKfycbzz4LafuelRlkPqFCivCO0RnU_PlmH0sqWXakF9AA2NYEG2NxFrjDtVKyVs1PuEBoXxgw/exec',
  // Apps Script cold starts can take several seconds.
  requestTimeoutMs: 20000,
  // Record approximate city/region from the patient's IP at registration
  // (ipapi.co, falling back to ipwho.is). Set to false to disable.
  geoLookup: true,
  // Keep a verified card open across reloads in the same browser tab.
  sessionMinutes: 30
});
