/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: { extend: {
      screens: {
        'xs': '480px',
        'sm': '50rem',
      },
    }
  },
  plugins: [],
};