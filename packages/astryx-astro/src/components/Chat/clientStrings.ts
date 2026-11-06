/**
 * Server-rendered message templates the chat elements fill in the browser (elements never
 * translate). The pasted-text label ("{lines} lines, {chars} chars") has two plural
 * arguments, so it ships one template per (lines form × chars form): lines `=1` (Astryx's
 * exact-one branch) plus each plural category, chars each category. Samples avoid 0/1 where a
 * category allows it and never share a value, so the numbers swap back to placeholders
 * unambiguously (`⁣lines⁣`, `⁣chars⁣`, see Field/clientMessages.ts).
 */
import type {Translate} from '../../lib/i18n';
import {placeholder} from '../Field/clientMessages';

function categories(locale: string): {rules: Intl.PluralRules; list: string[]} {
  let rules: Intl.PluralRules;
  try { rules = new Intl.PluralRules(locale); } catch { rules = new Intl.PluralRules('en'); }
  return {rules, list: rules.resolvedOptions().pluralCategories as string[]};
}

function sampleFor(rules: Intl.PluralRules, category: string, avoid: Set<number>): number | undefined {
  for (let n = 2; n <= 1000; n++) if (!avoid.has(n) && rules.select(n) === category) return n;
  for (const n of [0, 1]) if (!avoid.has(n) && rules.select(n) === category) return n;
  return undefined;
}

function formsOf(n: number, locale: string): string[] {
  const forms = new Set<string>();
  for (const l of [locale, 'en']) {
    try { forms.add(new Intl.NumberFormat(l).format(n)); } catch { /* invalid locale */ }
  }
  forms.add(String(n));
  return [...forms].sort((a, b) => b.length - a.length);
}

function swapNumber(text: string, n: number, locale: string, name: string): string {
  for (const form of formsOf(n, locale)) {
    const escaped = form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?<![\\d.,\\u00a0\\u202f])${escaped}(?![\\d.,\\u00a0\\u202f]*\\d)`, 'g');
    if (re.test(text)) return text.replace(re, placeholder(name));
  }
  return text;
}

/** JSON: `{"=1"|category: {category: template}}` for `@astryx.chat.pastedText.label`. */
export function pastedLabelTemplates(t: Translate, locale: string): string {
  const {rules, list} = categories(locale);
  const out: Record<string, Record<string, string>> = {};
  const lineKeys: Array<[string, number | undefined]> = [['=1', 1], ...list.map((c) => [c, sampleFor(rules, c, new Set([1]))] as [string, number | undefined])];
  for (const [key, lines] of lineKeys) {
    if (lines === undefined) continue;
    const forms: Record<string, string> = {};
    for (const category of list) {
      const chars = sampleFor(rules, category, new Set([lines]));
      if (chars === undefined) continue;
      let text = t('@astryx.chat.pastedText.label', {lines, chars});
      text = swapNumber(text, chars, locale, 'chars');
      text = swapNumber(text, lines, locale, 'lines');
      forms[category] = text;
    }
    out[key] = forms;
  }
  return JSON.stringify(out);
}
