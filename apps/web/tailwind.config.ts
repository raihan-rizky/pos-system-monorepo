import type { Config } from "tailwindcss";
import sharedConfig from "@pos/config/tailwind.config";
import typography from "@tailwindcss/typography";

const config: Config = {
  ...sharedConfig,
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./features/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
  plugins: [
    typography,
  ],
};

export default config;
