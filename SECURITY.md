# Security policy

## Reporting a vulnerability

Please **do not open a public issue**. Use GitHub's
[private vulnerability reporting](https://github.com/Sathvik150/socratica/security/advisories/new) instead.
Include steps to reproduce and the affected component (extension, CLI, skill, core).

## Scope and design notes

- The extension makes **no network calls until the user accepts the privacy notice**, and all requests
  go through the background service worker.
- API keys are stored only in `chrome.storage.local` (extension) or read from environment variables (CLI).
  They are never logged and are sent only to the provider they belong to.
- Evidence text comes from the web and is treated as untrusted. It is rendered with `textContent`, only
  `http(s)` links are made clickable, and the judge prompt tells the model to ignore instructions inside passages.

Issues of particular interest: anything that sends conversation text before consent, leaks a key, renders
evidence as HTML, or lets a fabricated quote survive validation.
