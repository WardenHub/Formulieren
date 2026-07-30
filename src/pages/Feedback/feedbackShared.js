export const SENTIMENT_OPTIONS = [
  { key: "positive", label: "Positief", tagClass: "monitor-tag monitor-tag--success" },
  { key: "negative", label: "Negatief", tagClass: "monitor-tag monitor-tag--danger" },
  { key: "proposal", label: "Voorstel", tagClass: "monitor-tag monitor-tag--proposal" },
];

export function getSentimentMeta(sentiment) {
  return SENTIMENT_OPTIONS.find((option) => option.key === sentiment) || SENTIMENT_OPTIONS[0];
}
