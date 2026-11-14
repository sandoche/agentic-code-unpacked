document.querySelectorAll<HTMLElement>("[data-copy-root]").forEach((root) => {
  const button = root.querySelector<HTMLButtonElement>("[data-copy]");
  const code = root.querySelector<HTMLElement>("[data-copy-text]");
  const status = root.querySelector<HTMLElement>("[data-copy-status]");
  if (!button || !code || !status) return;
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(code.textContent?.trim() ?? "");
      status.textContent = button.dataset.success ?? "Copied";
    } catch {
      const range = document.createRange();
      range.selectNodeContents(code);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      code.focus();
      status.textContent = button.dataset.fallback ?? "Select the command and copy it manually.";
    } finally {
      button.disabled = false;
    }
  });
});
