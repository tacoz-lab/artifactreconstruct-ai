/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
        "./**/*.{js,ts,jsx,tsx}", // Cover root files like App.tsx
    ],
    theme: {
        extend: {},
    },
    plugins: [],
}
