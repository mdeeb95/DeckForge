/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: [
    "./index.html",
    "./src/**/*.{svelte,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        "primary": "#0df2f2",
        "primary-dim": "#089090",
        "secondary": "#f20dcf",
        "background-light": "#f5f8f8",
        "background-dark": "#0d1117",
        "surface-dark": "#161b22",
        "surface-border": "#30363d",
      },
      fontFamily: {
        "display": ["Space Grotesk", "sans-serif"],
        "mono": ["JetBrains Mono", "monospace"],
      },
      borderRadius: {
        "DEFAULT": "0.125rem",
        "lg": "0.25rem",
        "xl": "0.5rem",
        "full": "9999px"
      },
    },
  },
  plugins: [],
}
