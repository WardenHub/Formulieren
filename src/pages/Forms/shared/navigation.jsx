// src/pages/Forms/shared/navigation.jsx

export function getQuestionElementByName(questionName, renderedQuestionElementsRef) {
  if (!questionName) return null;

  const key = String(questionName).trim();
  if (!key) return null;

  const direct = renderedQuestionElementsRef?.current?.get(key) || null;
  if (direct && document.contains(direct)) {
    return direct;
  }

  return null;
}

export function scrollToDesignerQuestion(questionName, renderedQuestionElementsRef) {
  const el = getQuestionElementByName(questionName, renderedQuestionElementsRef);
  if (!el) return false;

  el.scrollIntoView({
    behavior: "smooth",
    block: "center",
    inline: "nearest",
  });

  el.classList.add("ember-nav-target-flash");
  window.setTimeout(() => {
    el.classList.remove("ember-nav-target-flash");
  }, 1800);

  return true;
}

export function getQuestionElement(question) {
  if (!question?.name) return null;

  const escaped =
    typeof CSS !== "undefined" && CSS.escape
      ? CSS.escape(String(question.name))
      : String(question.name);

  return document.querySelector(`[data-name="${escaped}"]`);
}

export function scrollToQuestion(question) {
  const el = getQuestionElement(question);
  if (!el) return false;

  el.scrollIntoView({
    behavior: "smooth",
    block: "center",
  });

  return true;
}

export function scrollToQuestionByName(questionName) {
  if (!questionName) return false;

  const escaped =
    typeof CSS !== "undefined" && CSS.escape
      ? CSS.escape(String(questionName))
      : String(questionName);

  const el = document.querySelector(`[data-name="${escaped}"]`);
  if (!el) return false;

  el.scrollIntoView({
    behavior: "smooth",
    block: "center",
  });

  return true;
}