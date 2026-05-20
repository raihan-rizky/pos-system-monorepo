import type { Config } from "tailwindcss";
import sharedConfig from "@pos/config/tailwind.config";

const config: Config = {
  ...sharedConfig,
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./features/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
};

export default config;
