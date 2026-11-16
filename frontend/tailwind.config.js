/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          blue: '#0052cc',
          navy: '#0b192c',
          gold: '#f59e0b',
        }
      }
    },
  },
  plugins: [],
}
