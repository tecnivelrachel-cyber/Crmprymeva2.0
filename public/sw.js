const CACHE_NAME = "prymeva-crm-shell-v1";
const OFFLINE_URL = "/offline";
const SHELL_ASSETS = [OFFLINE_URL, "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// Só intercepta navegação de página (para mostrar a tela offline sem rede).
// Nenhuma outra requisição — API, RSC, Supabase, dados autenticados, tokens —
// é interceptada ou armazenada em cache; elas seguem direto para a rede.
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;

  event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE_URL)));
});

// Push com o navegador fechado. O payload vem do servidor e nunca contém o
// conteúdo da mensagem — só quem mandou e o id da conversa.
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = payload.title || "Nova mensagem";
  const conversationId = payload.conversationId || null;

  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "Nova mensagem recebida.",
      // A tag agrupa por conversa: mensagens seguidas do mesmo contato
      // substituem a notificação anterior em vez de empilhar.
      tag: payload.tag || "prymeva-mensagem",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { conversationId },
    })
  );
});

// Clique na notificação: foca uma janela já aberta do CRM quando existir,
// em vez de abrir outra aba, e navega para a conversa certa.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const conversationId = event.notification.data && event.notification.data.conversationId;
  const target = conversationId ? `/conversas?id=${conversationId}` : "/conversas";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          if ("navigate" in client) client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
