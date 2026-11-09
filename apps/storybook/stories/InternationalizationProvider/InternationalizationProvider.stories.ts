import InternationalizationProvider from 'astryx-astro/components/i18n/InternationalizationProvider.astro';
import Demo from 'astryx-astro/components/i18n/InternationalizationProvider.demo.astro';
import demoSource from 'astryx-astro/components/i18n/InternationalizationProvider.demo.astro?raw';
import {expect} from 'storybook/test';
import {upgraded} from '../_lib/play';
import {astryx, composed, overview, type Meta} from '../_lib/story';
import ProviderStory from './InternationalizationProviderStory.astro';
import providerSource from './InternationalizationProviderStory.astro?raw';

const meta = {
  title: 'Utility/Internationalization Provider',
  component: InternationalizationProvider,
  ...astryx('InternationalizationProvider'),
  args: {locale: 'fr-FR'},
} satisfies Meta;
export default meta;

/** Every example from the docs page (InternationalizationProvider.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

const options = {controls: ['locale', 'calendar', 'overrides', 'nestedLocale'], source: providerSource};

type Canvas = {getByRole: (role: string, options: {name: string | RegExp}) => HTMLElement; getByTestId: (id: string) => HTMLElement};
/** The children's translated strings: the Spinner's name and the Calendar's next-month button. */
const expectStrings = async (canvas: Canvas, canvasElement: HTMLElement, loading: string, nextMonth: string) => {
  await upgraded(canvasElement, 'ax-calendar');
  await expect(canvas.getByTestId('spinner')).toHaveAccessibleName(loading);
  await expect(canvas.getByRole('button', {name: nextMonth})).toBeVisible();
};

/** French: translated labels, French month and day names, day-month-year dates. */
export const French = composed(ProviderStory, {
  args: {locale: 'fr-FR'},
  play: async ({canvas, canvasElement}) => {
    await expectStrings(canvas, canvasElement, 'Chargement', 'Mois suivant');
    await expect(canvas.getByTestId('provided')).toHaveTextContent(/novembre 2026/i);
  },
}, options);

/** German. */
export const German = composed(ProviderStory, {
  args: {locale: 'de-DE'},
  play: async ({canvas, canvasElement}) => {
    await expectStrings(canvas, canvasElement, 'Wird geladen', 'Nächster Monat');
    await expect(canvas.getByTestId('provided')).toHaveTextContent(/November 2026/);
  },
}, options);

/** Japanese. */
export const Japanese = composed(ProviderStory, {
  args: {locale: 'ja-JP'},
  play: async ({canvas, canvasElement}) => {
    await expectStrings(canvas, canvasElement, '読み込み中', '翌月');
    await expect(canvas.getByTestId('provided')).toHaveTextContent(/2026年11月/);
  },
}, options);

/** Arabic, right to left: the page sets `dir` from the locale (the provider never writes it). */
export const ArabicRightToLeft = composed(ProviderStory, {
  args: {locale: 'ar-SA'},
  play: async ({canvas, canvasElement}) => {
    await expectStrings(canvas, canvasElement, 'جارٍ التحميل', 'الشهر التالي');
    await expect(canvas.getByTestId('provided')).toHaveAttribute('dir', 'rtl');
  },
}, options);

/** `calendar="japanese"`: the subtree's calendar system (values stay Gregorian ISO). */
export const JapaneseCalendar = composed(ProviderStory, {
  args: {locale: 'ja-JP', calendar: 'japanese'},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-calendar');
    // Reiwa 8 is 2026.
    await expect(canvas.getByTestId('provided')).toHaveTextContent(/令和8年/);
  },
}, options);

/** `overrides`: sparse per-locale replacements of Astryx strings. */
export const Overrides = composed(ProviderStory, {
  args: {locale: 'fr-FR', overrides: {'fr-FR': {'@astryx.spinner.loading': 'Un instant…', '@astryx.calendar.nextMonth': 'Mois prochain'}}},
  play: async ({canvas, canvasElement}) => {
    await expectStrings(canvas, canvasElement, 'Un instant…', 'Mois prochain');
  },
}, options);

/** A nested provider wins for its own subtree; the outer locale holds around it. */
export const Nested = composed(ProviderStory, {
  args: {locale: 'fr-FR', nestedLocale: 'de-DE'},
  play: async ({canvas}) => {
    await expect(canvas.getByTestId('spinner')).toHaveAccessibleName('Chargement');
    await expect(canvas.getByTestId('nested-spinner')).toHaveAccessibleName('Wird geladen');
  },
}, options);
