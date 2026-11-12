import { mountPanel } from "./ui/panel.js";

function boot(): void {
  const root = document.getElementById("app");
  if (!root) {
    throw new Error("#app not found");
  }
  mountPanel(root);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
