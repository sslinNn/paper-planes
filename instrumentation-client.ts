import { analytics } from "./lib/track";

// Аналитика стартует после загрузки страницы, чтобы её бандл не мешал карте появиться
const start = () => setTimeout(analytics, 1000);
if (document.readyState === "complete") start();
else addEventListener("load", start);
