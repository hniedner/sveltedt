// The listener (PRD-S1): each policy violation of its page, one entry per event, added to window.__csp, which the
// browser tests read. Loaded by every page as its first script, as a plain file of the site.
window.__csp = [];
document.addEventListener("securitypolicyviolation", (event) => {
  window.__csp.push({
    directive: event.effectiveDirective,
    blocked: event.blockedURI,
  });
});
