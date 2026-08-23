"use client";

import { useEffect } from "react";

export function RegisterServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Registro falhou silenciosamente — o CRM funciona normalmente sem o PWA.
      });
    }
  }, []);

  return null;
}
