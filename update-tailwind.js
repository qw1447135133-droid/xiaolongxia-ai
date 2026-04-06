const fs = require('fs');
const content = `/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: {
          primary: "#0B0E11",
          secondary: "#181A20",
          card: "#1E2329",
          hover: "#2B3139",
          border: "#2B3139",
        },
        text: {
          primary: "#EAECEF",
          secondary: "#848E9C",
          muted: "#5E6673",
        },
        accent: {
          blue: "#3b82f6",
          green: "#0ECB81",
          red: "#F6465D",
          yellow: "#FCD535",
        },
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      }
    },
  },
  plugins: [],
};
`;
fs.writeFileSync('D:\\GitHub\\Quantitative Finance\\frontend\\tailwind.config.js', content);
