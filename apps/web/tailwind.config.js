/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
  plugins: [
    require('tailwind-scrollbar-hide'),
    require('@tailwindcss/typography'),
  ],
}
