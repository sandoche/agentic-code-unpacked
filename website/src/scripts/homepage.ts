function setupSwitch(root: HTMLElement): void {
  const tablist = root.querySelector<HTMLElement>(":scope > [data-switch-tabs]");
  const tabs = Array.from(tablist?.querySelectorAll<HTMLAnchorElement>("[data-switch-tab]") ?? []);
  const panels = Array.from(
    root.querySelectorAll<HTMLElement>(":scope > [data-switch-panels] > [data-switch-panel]"),
  );
  if (!tablist || !tabs.length || tabs.length !== panels.length) return;
  const activate = (index: number, focus = false): void => {
    tabs.forEach((tab, position) => {
      const active = position === index;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
      const panel = panels[position];
      if (panel) panel.hidden = !active;
    });
    if (focus) tabs[index]?.focus();
  };
  tablist.setAttribute("role", "tablist");
  tabs.forEach((tab, index) => {
    const panel = panels[index];
    if (!panel) return;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", panel.id);
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", tab.id);
    tab.addEventListener("click", (event) => {
      event.preventDefault();
      activate(index);
    });
    tab.addEventListener("keydown", (event) => {
      let next: number;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % tabs.length;
      else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
        next = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = tabs.length - 1;
      else return;
      event.preventDefault();
      activate(next, true);
    });
  });
  root.classList.add("is-enhanced");
  activate(0);
}

function setupWalkthrough(root: HTMLElement): void {
  const steps = Array.from(root.querySelectorAll<HTMLElement>("[data-step]"));
  const previous = root.querySelector<HTMLButtonElement>("[data-previous]");
  const next = root.querySelector<HTMLButtonElement>("[data-next]");
  const status = root.querySelector<HTMLOutputElement>("[data-step-status]");
  if (!steps.length || !previous || !next || !status) return;
  let current = 0;
  const show = (): void => {
    steps.forEach((step, index) => {
      step.hidden = index !== current;
    });
    previous.disabled = current === 0;
    next.disabled = current === steps.length - 1;
    status.textContent = steps[current]?.querySelector("[data-step-title]")?.textContent ?? "";
  };
  previous.addEventListener("click", () => {
    current = Math.max(0, current - 1);
    show();
  });
  next.addEventListener("click", () => {
    current = Math.min(steps.length - 1, current + 1);
    show();
  });
  root.classList.add("is-enhanced");
  show();
}

function setupCopy(root: HTMLElement): void {
  const button = root.querySelector<HTMLButtonElement>("[data-copy]");
  const code = root.querySelector<HTMLElement>("[data-copy-text]");
  const status = root.querySelector<HTMLElement>("[data-copy-status]");
  if (!button || !code || !status) return;
  button.addEventListener("click", async () => {
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(code.textContent ?? "");
      status.textContent = button.dataset.success ?? "";
    } catch {
      const range = document.createRange();
      range.selectNodeContents(code);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      code.focus();
      status.textContent = button.dataset.fallback ?? "";
    } finally {
      button.disabled = false;
      button.removeAttribute("aria-busy");
    }
  });
  root.classList.add("is-enhanced");
}

function setupQuiz(form: HTMLFormElement): void {
  const questions = Array.from(form.querySelectorAll<HTMLFieldSetElement>("[data-question]"));
  const status = form.querySelector<HTMLElement>("[data-quiz-status]");
  const check = form.querySelector<HTMLButtonElement>("[data-check]");
  const retake = form.querySelector<HTMLButtonElement>("[data-retake]");
  if (!questions.length || !status || !check || !retake) return;
  const resetFeedback = (): void => {
    questions.forEach((question) => {
      const explanation = question.querySelector<HTMLDetailsElement>("[data-explanation]");
      if (explanation) {
        explanation.hidden = true;
        explanation.open = false;
      }
      const feedback = question.querySelector<HTMLElement>("[data-option-feedback]");
      if (feedback) feedback.textContent = "";
      question.removeAttribute("data-result");
      question.querySelectorAll<HTMLInputElement>("input").forEach((input) => {
        input.disabled = false;
      });
    });
    check.hidden = false;
    retake.hidden = true;
    status.textContent = "";
  };
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const missing = questions.find(
      (question) => !question.querySelector<HTMLInputElement>("input:checked"),
    );
    if (missing) {
      status.textContent = form.dataset.requiredLabel ?? "";
      missing.querySelector<HTMLInputElement>("input")?.focus();
      return;
    }
    let score = 0;
    questions.forEach((question) => {
      const answer = question.querySelector<HTMLInputElement>("input:checked");
      if (!answer) return;
      const correct = answer.value === question.dataset.correctOption;
      if (correct) score++;
      question.dataset.result = correct ? "correct" : "incorrect";
      const feedback = question.querySelector<HTMLElement>("[data-option-feedback]");
      if (feedback)
        feedback.textContent = `${correct ? form.dataset.correctLabel : form.dataset.incorrectLabel}. ${answer.dataset.feedback ?? ""}`;
      const explanation = question.querySelector<HTMLDetailsElement>("[data-explanation]");
      if (explanation) {
        explanation.hidden = false;
        explanation.open = true;
      }
      question.querySelectorAll<HTMLInputElement>("input").forEach((input) => {
        input.disabled = true;
      });
    });
    status.textContent = `${form.dataset.scoreLabel}: ${score}/${questions.length}`;
    check.hidden = true;
    retake.hidden = false;
  });
  retake.addEventListener("click", () => {
    form.reset();
    resetFeedback();
    questions[0]?.querySelector<HTMLInputElement>("input")?.focus();
  });
  form.classList.add("is-enhanced");
  resetFeedback();
}

function setupComic(root: HTMLElement): void {
  const panels = Array.from(root.querySelectorAll<HTMLElement>("[data-comic-panel]"));
  const image = root.querySelector<HTMLImageElement>("[data-comic-strip]");
  const title = root.querySelector<HTMLElement>("[data-comic-title]");
  const transcript = root.querySelector<HTMLElement>("[data-comic-transcript]");
  const status = root.querySelector<HTMLOutputElement>("[data-comic-status]");
  const previous = root.querySelector<HTMLButtonElement>("[data-previous]");
  const next = root.querySelector<HTMLButtonElement>("[data-next]");
  if (!panels.length || !image || !title || !transcript || !status || !previous || !next) return;
  let current = 0;
  const show = (): void => {
    const panel = panels[current];
    image.style.transform = `translateX(-${(current / panels.length) * 100}%)`;
    title.textContent = panel?.dataset.title ?? "";
    transcript.textContent = panel?.dataset.transcript ?? "";
    status.textContent = title.textContent;
    previous.disabled = current === 0;
    next.disabled = current === panels.length - 1;
  };
  previous.addEventListener("click", () => {
    current = Math.max(0, current - 1);
    show();
  });
  next.addEventListener("click", () => {
    current = Math.min(panels.length - 1, current + 1);
    show();
  });
  root.classList.add("is-enhanced");
  show();
}

document.querySelectorAll<HTMLElement>("[data-switch]").forEach(setupSwitch);
document.querySelectorAll<HTMLElement>("[data-walkthrough]").forEach(setupWalkthrough);
document.querySelectorAll<HTMLElement>("[data-copy-root]").forEach(setupCopy);
document.querySelectorAll<HTMLFormElement>("[data-quiz]").forEach(setupQuiz);
document.querySelectorAll<HTMLElement>("[data-comic]").forEach(setupComic);
document.querySelectorAll<HTMLDetailsElement>(".mobile-nav").forEach((menu) => {
  menu.querySelectorAll<HTMLAnchorElement>("a").forEach((link) => {
    link.addEventListener("click", () => {
      menu.open = false;
    });
  });
});
