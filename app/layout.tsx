import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { RegisterServiceWorker } from "@/components/pwa/register-sw";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: "TecNivel CRM",
  description: "Gestão comercial, atendimento e relacionamento em um só lugar.",
};

export const viewport: Viewport = {
  themeColor: "#17304F",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body className="font-sans antialiased">
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
