/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/**/*.{ts,tsx}",
    "../../packages/board/src/**/*.{ts,tsx}",
    "../../packages/board/dist/**/*.{js,ts,tsx}",
    "./node_modules/@teatime-ai/board/dist/**/*.{js,ts,tsx}",
  ],
  plugins: [
    require('tailwind-scrollbar-hide'),
    require('@tailwindcss/typography'),
  ],
}
