# OpenAI Ads Conversions — applicability review

Reviewed 18 October 2026 against the current public Measurement Pixel,
Conversions API and Supported Events documentation.

## Result and setup inventory

Mode: **review existing integration / readiness assessment**. No ad SDK,
network dispatch, placeholder tracker, new secret or conversion route was
added. No existing OpenAI Ads integration was found in this project.

The active target is a native iOS app. The parent React/Vite/Express client is
a retained web reference. It exposes `/api/generate-music`; it is not a native
conversion server and does not confirm an order, signup, subscription or trial.

- Pixel: skipped for the native surface; the documented Pixel is browser JS.
  The legacy web app was not given a second analytics integration.
- CAPI: a future native setup would use a server-only integration, an existing
  web data-source Pixel ID and the documented `mobile_app` action source.
  No native client-to-server conversion boundary, approved matching/attribution
  path, consent policy or Ads secret reference is configured here.
- Existing/added events: none. Successful audio startup, pad taps, FX changes,
  generation requests and WAV export are not treated as purchases or signups.
- Pixel ID, CAPI secret reference, Pixel user matching, Pixel opt-out, `oppref`,
  `source_url` and browser-provided URL trust boundary: not configured; no data
  is collected or sent by this review.
- Deduplication: no dispatcher exists. Any future implementation must define
  stable logical event IDs and retry behavior before activation.

## Supported-event coverage

| Events | Status / reason |
| --- | --- |
| `app_installed` | Deferred: no durable install identity or confirmed installation-success source; a cold launch is not proof of a new installation |
| `app_opened` | Deferred: foreground lifecycle exists, but approved native attribution/consent and server reporting path do not |
| `page_viewed` | Not added to native UI; legacy web reference intentionally outside this setup |
| `contents_viewed` | No approved advertising content-view boundary identified; selecting a sound is not silently repurposed as an ad conversion |
| `items_added`, `checkout_started`, `order_created` | No cart, checkout or completed-purchase flow found |
| `lead_created`, `registration_completed`, `appointment_scheduled` | No lead, signup or booking success boundary found |
| `subscription_created`, `trial_started` | No subscription or trial success boundary found |
| `custom` | No advertiser-defined conversion was supplied; none is invented |

The current docs add CAPI-only app lifecycle events and expressly state that
native mobile SDK setup/mobile data sources are not supported. This extends
the installed skill's older event examples; current docs take precedence.

## Verification and activation boundary

The skill's `verify_capi_secret_not_exposed.py` local scan completed with zero
findings. It reports paths/rules without source context or external transfers.
The scan does not prove runtime consent behavior or constitute a broader secret
audit. Pixel/CAPI setup-required checks are inapplicable because neither is
installed. No live conversion endpoint was called.

For future activation, define the actual business event, its confirmed success
boundary, consent/opt-out behavior, minimal supported matching context, existing
server secret reference, bounded non-blocking dispatch and stable event IDs.
All event construction and dispatch must stay outside the UI/audio real-time
path. Do not embed CAPI credentials in the React Native bundle, use IDFA, or
infer app installation from every launch.

## Sources

- [Measurement Pixel](https://developers.openai.com/ads/measurement-pixel)
- [Conversions API, app lifecycle events](https://developers.openai.com/ads/conversions-api)
- [Supported Events](https://developers.openai.com/ads/supported-events)

Before deploying any future Ads integration, review its privacy, security,
consent and data-handling requirements for the actual product and event flow.
