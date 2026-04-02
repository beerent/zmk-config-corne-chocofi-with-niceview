import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          0: "#0a0a0f",
          1: "#12121a",
          2: "#1a1a25",
          3: "#242430",
        },
        accent: {
          DEFAULT: "#7c6ef0",
          hover: "#9589f5",
          dim: "#5a4fd0",
        },
        key: {
          DEFAULT: "#1e1e2e",
          hover: "#2a2a3e",
          border: "#333348",
          active: "#7c6ef0",
          text: "#cdd6f4",
          subtext: "#6c7086",
        },
      },
    },
  },
  plugins: [],
};
export default config;
