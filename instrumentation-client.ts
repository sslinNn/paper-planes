import posthog from "posthog-js";

const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;

// Без ключа ничего не шлём
if (key) {
  posthog.init(key, {
    // Через свой домен — адблоки не режут /ingest (см. rewrites в next.config.ts)
    api_host: "/ingest",
    ui_host: "https://eu.posthog.com",
    defaults: "2026-08-30",
  });
}
