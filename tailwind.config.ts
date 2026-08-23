import type { Config } from "tailwindcss";

/**
 * TecNível Precision Interface.
 *
 * Os NOMES das escalas foram mantidos (navy/sky/accent/surface/ink) para que
 * toda a UI existente herde a nova identidade sem reescrever componente por
 * componente — o que mudou foram os VALORES, alinhados aos tokens oficiais
 * declarados em app/globals.css.
 */
const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Azul-marinho — sidebar, títulos e botões principais
        navy: {
          50: "#F1F7FD",
          100: "#DCEEFF",
          400: "#3B8AEC",
          600: "#2674D9",
          700: "#123557",
          800: "#0B213D",
          900: "#07182D",
        },
        // Azul claro — superfícies secundárias e seleção
        sky: {
          50: "#F1F7FD",
          100: "#DCEEFF",
          200: "#C4E0FB",
          300: "#75AEEF",
        },
        // Laranja — somente CTAs comerciais importantes
        accent: {
          400: "#F79557",
          500: "#F47A27",
          600: "#E96616",
        },
        surface: {
          DEFAULT: "#F4F8FC",
          card: "#FFFFFF",
          border: "#DCE6F0",
          subtle: "#E9F0F6",
          muted: "#F8FBFE",
          selected: "#EAF4FF",
        },
        ink: {
          900: "#10243E",
          700: "#3B5470",
          500: "#5C718A",
          400: "#8495A8",
          300: "#A9B7C6",
        },
        success: "#22A66F",
        warning: "#E5A52A",
        danger: "#DC5B64",
        purple: "#7257C7",
        // Assinatura laser — só em detalhes finos, nunca em áreas grandes
        laser: {
          DEFAULT: "#E53E35",
          soft: "rgba(229, 62, 53, 0.12)",
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
