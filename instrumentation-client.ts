import posthog from "posthog-js";

const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;

// Ключ есть только на Vercel: локально ничего не шлём
if (key) {
  posthog.init(key, {
    // Через свой домен — адблоки не режут /ingest (см. rewrites в next.config.ts)
    api_host: "/ingest",
    ui_host: "https://eu.posthog.com",
    defaults: "2026-08-30",
    // ошибки фронта — в Error tracking PostHog
    capture_exceptions: true,
  });
}
