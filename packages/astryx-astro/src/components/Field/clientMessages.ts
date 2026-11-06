/**
 * Server-rendered message templates for strings a client element must build at runtime
 * (TextArea's counter, FileInput's selection announcements …). Elements never translate:
 * the server resolves the message in the request locale and leaves `⁣name⁣`
 * placeholders where the dynamic ICU arguments go; `fillMessage()` / `fillPlural()` in
 * elements/field.ts substitute them (numbers formatted with Intl in the same locale).
 *
 *   data-counter={messageTemplate(t, locale, '@astryx.textArea.counter', {limit: 280}, ['count'])}
 *   data-remaining={pluralTemplates(t, locale, '@astryx.textArea.charactersRemaining', 'count')}
 *
 * Arguments are rendered with sentinel numbers and their formatted forms swapped for the
 * placeholder, so `{count, number}` and plain `{name}` arguments both work. A plural
 * argument gets one template per plural category of the locale (Intl.PluralRules), each
 * rendered with a number of that category.
 */
import type {Translate} from '../../lib/i18n';

export const placeholder = (name: string) => `⁣${name}⁣`;

function formsOf(n: number, locale: string): string[] {
  const forms = new Set<string>();
  for (const l of [locale, 'en']) {
    try { forms.add(new Intl.NumberFormat(l).format(n)); } catch { /* invalid locale */ }
  }
  forms.add(String(n));
  return [...forms];
}

function swap(text: string, n: number, locale: string, name: string): string {
  for (const form of formsOf(n, locale)) if (text.includes(form)) return text.split(form).join(placeholder(name));
  return text;
}

/** A message with `args` left as placeholders (string or number arguments, not plurals). */
export function messageTemplate(t: Translate, locale: string, key: string, values: Record<string, unknown> = {}, args: string[] = []): string {
  const sentinels = args.map((_, i) => 987654320 + i);
  let text = t(key, {...values, ...Object.fromEntries(args.map((a, i) => [a, sentinels[i]]))});
  args.forEach((a, i) => { text = swap(text, sentinels[i], locale, a); });
  return text;
}

/** One template per plural category for the plural argument `arg` (JSON). */
export function pluralTemplates(t: Translate, locale: string, key: string, arg: string, values: Record<string, unknown> = {}): string {
  let rules: Intl.PluralRules;
  try { rules = new Intl.PluralRules(locale); } catch { rules = new Intl.PluralRules('en'); }
  const out: Record<string, string> = {};
  for (const category of rules.resolvedOptions().pluralCategories) {
    let sample: number | undefined;
    for (let n = 0; n <= 1000 && sample === undefined; n++) if (rules.select(n) === category) sample = n;
    if (sample === undefined) continue;
    out[category] = swap(t(key, {...values, [arg]: sample}), sample, locale, arg);
  }
  return JSON.stringify(out);
}
