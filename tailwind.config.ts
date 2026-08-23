import type { Config } from "tailwindcss";

/**
 * Prymeva Cognitive Interface.
 *
 * Os NOMES das escalas foram mantidos (navy/sky/accent/surface/ink) para que
 * toda a UI existente herde a identidade da marca sem reescrever componente
 * por componente — o que muda são os VALORES, alinhados à identidade oficial
 * do Prymeva CRM (violeta → magenta) e espelhados em app/globals.css.
 *
 * Esta é a paleta PADRÃO do produto. Cada instalação vendida a um cliente
 * poderá sobrepor sua própria cor de destaque em Configurações > Empresa
 * (ver lib/company/settings.ts) sem precisar editar este arquivo — a marca
 * "Prymeva CRM" em si permanece fixa.
 */
const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Violeta — sidebar, títulos e botões principais
        navy: {
          50: "#F6F1FD",
          100: "#EDE1FB",
          400: "#A736DA",
          600: "#7129D4",
          700: "#6225D5",
          800: "#3D1782",
          900: "#20162D",
        },
        // Lilás claro — superfícies secundárias e seleção
        sky: {
          50: "#F8F1FD",
          100: "#EEE1FA",
          200: "#E2C9F5",
          300: "#C79AE8",
        },
        // Magenta — somente CTAs comerciais importantes
        accent: {
          400: "#E672B8",
          500: "#DF4BA5",
          600: "#C93E91",
        },
        surface: {
          DEFAULT: "#FAF7FD",
          card: "#FFFFFF",
          border: "#E6D9F2",
          subtle: "#F1E9F8",
          muted: "#FBF7FE",
          selected: "#F3E5FA",
        },
        ink: {
          900: "#20162D",
          700: "#4A3B57",
          500: "#706477",
          400: "#8F849A",
          300: "#B6ABBE",
        },
        success: "#22A66F",
        warning: "#E5A52A",
        danger: "#DC5B64",
        purple: "#7129D4",
        // Assinatura laser — só em detalhes finos, nunca em áreas grandes
        laser: {
          DEFAULT: "#E14B9E",
          soft: "rgba(225, 75, 158, 0.12)",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Inter", "system-ui", "sans-serif"],
      },
      borderRadius: {
        lg: "0.625rem", // 10px — botões
        xl: "0.875rem", // 14px — cards compactos
        "2xl": "1.125rem", // 18px — cards principais
        "3xl": "1.25rem", // 20px — modais
      },
      boxShadow: {
        soft: "0 1px 2px 0 rgba(16, 36, 62, 0.04), 0 1px 6px -1px rgba(16, 36, 62, 0.06)",
        card: "0 2px 10px -2px rgba(16, 36, 62, 0.10)",
        panel: "0 8px 28px -8px rgba(16, 36, 62, 0.18)",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "slide-in": {
          from: { transform: "translateX(8px)", opacity: "0" },
          to: { transform: "translateX(0)", opacity: "1" },
        },
        "drop-in": {
          from: { transform: "translateY(-4px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
        "modal-in": {
          from: { transform: "scale(0.98)", opacity: "0" },
          to: { transform: "scale(1)", opacity: "1" },
        },
        "laser-sweep": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "fade-in": "fade-in 180ms ease-out both",
        "slide-in": "slide-in 180ms ease-out both",
        "drop-in": "drop-in 140ms ease-out both",
        "modal-in": "modal-in 200ms ease-out both",
        "laser-sweep": "laser-sweep 1.2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
