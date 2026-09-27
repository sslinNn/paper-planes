import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // X не принимает localhost в callback URL — локально работаем на 127.0.0.1
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
