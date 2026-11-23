// Deterministic keyword classifier (T-B1). Pure function: same input -> same output.

const has = (text, words) => words.some((w) => (w instanceof RegExp ? w.test(text) : text.includes(w)));

// Rules are evaluated top to bottom; first match wins.
const CATEGORY_RULES = [
  ['BILLING', ['refund', 'invoice', 'charge', 'payment']],
  ['LOGIN', ['password', '2fa', 'sign in', 'locked out', 'login']],
  ['DELIVERY', ['package', 'arrived', 'shipping', 'tracking', 'delivery']],
  ['BUG', ['crash', 'error', /\b500\b/, 'exception', 'broken']],
];

export function classify(subject, body) {
  const text = `${subject} ${body}`.toLowerCase();

  let category = 'FEATURE_REQUEST';
  for (const [name, words] of CATEGORY_RULES) {
    if (has(text, words)) {
      category = name;
      break;
    }
  }

  let priority = 'MEDIUM';
  if (has(text, ['urgent', 'production down', 'locked out'])) priority = 'URGENT';
  else if (has(text, ['error', 'refund', 'not arrived'])) priority = 'HIGH';

  return { category, priority };
}
