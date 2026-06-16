export function registerSW(): void {
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        console.log("[SW] Registered:", registration.scope);

        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (
              worker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              console.log("[SW] Update available — reload to get latest.");
            }
          });
        });
      })
      .catch((err) => {
        console.error("[SW] Registration failed:", err);
      });
  });
}
