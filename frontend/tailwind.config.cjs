module.exports = {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        nexus: {
          bg: "#07151d",
          card: "#10252b",
          panel: "#16323a",
          gold: "#d9b66f",
          line: "rgba(217,182,111,0.22)",
          text: "#f4f7f5",
          muted: "#95a6a8"
        }
      },
      boxShadow: {
        premium: "0 18px 50px rgba(0,0,0,0.28)"
      }
    }
  },
  plugins: []
};
