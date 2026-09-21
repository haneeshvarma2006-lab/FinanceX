/**
 * KyliX design tokens — the single source of truth.
 *
 * Authored as data, not as CSS, because React Native has no CSS. The web's
 * custom properties are *generated* from this file; a future mobile client
 * imports the same objects directly. Changing a value here changes both
 * clients, which is the only way two clients stay visually identical without
 * someone remembering to.
 *
 * Colour is OKLCH because it is perceptually uniform: two tokens with the same
 * lightness read as equally bright regardless of hue, so the domain accents
 * can differ in colour without one of them shouting over the others.
 */

export const typography = {
  fontSans:
    "'Inter Variable', 'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  fontMono: "ui-monospace, 'SF Mono', 'Cascadia Code', Menlo, monospace",

  /**
   * Eight sizes. Enough for an information-dense product, few enough that
   * hierarchy has to come from weight, colour and space rather than from
   * ever-larger text.
   */
  size: {
    '2xs': { size: '0.6875rem', line: '1rem' },
    xs: { size: '0.75rem', line: '1.125rem' },
    sm: { size: '0.875rem', line: '1.375rem' },
    base: { size: '1rem', line: '1.5rem' },
    lg: { size: '1.125rem', line: '1.625rem' },
    xl: { size: '1.375rem', line: '1.75rem' },
    '2xl': { size: '1.75rem', line: '2.125rem' },
    '3xl': { size: '2.25rem', line: '2.5rem' },
  },

  tracking: { tight: '-0.015em', wide: '0.08em' },
} as const;

export const radius = {
  control: '0.5rem',
  card: '0.75rem',
  sheet: '1rem',
} as const;

/**
 * Shadows on a dark surface must be near-black and generous, not grey and
 * tight, or they read as a smudge rather than elevation.
 */
export const shadow = {
  raised: '0 1px 2px oklch(0% 0 0 / 0.4)',
  overlay: '0 4px 12px oklch(0% 0 0 / 0.35), 0 1px 3px oklch(0% 0 0 / 0.3)',
  sheet: '0 16px 48px oklch(0% 0 0 / 0.5), 0 4px 12px oklch(0% 0 0 / 0.35)',
} as const;

export const shadowLight = {
  raised: '0 1px 2px oklch(0% 0 0 / 0.06)',
  overlay: '0 4px 12px oklch(0% 0 0 / 0.08), 0 1px 3px oklch(0% 0 0 / 0.06)',
  sheet: '0 16px 48px oklch(0% 0 0 / 0.12), 0 4px 12px oklch(0% 0 0 / 0.08)',
} as const;

/** Short, decelerating, never decorative. Past ~200ms reads as latency. */
export const motion = {
  easeOutSoft: 'cubic-bezier(0.22, 1, 0.36, 1)',
  easeInOutSoft: 'cubic-bezier(0.4, 0, 0.2, 1)',
  durationInstant: '80ms',
  durationFast: '140ms',
  durationBase: '200ms',
} as const;

/** Named for the device class each one serves, not for a round number. */
export const breakpoints = {
  sm: '40rem',
  md: '48rem',
  lg: '64rem',
  xl: '80rem',
} as const;

/**
 * Dark is primary, not an inversion applied afterwards.
 *
 * The foundation is a cinematic navy — a near-black with a measurable blue
 * cast (hue 265) rather than neutral grey, so the surface has depth without
 * any gradient doing the work.
 */
export const dark = {
  surfaceSunken: 'oklch(0.145 0.021 265)',
  surfaceBase: 'oklch(0.175 0.023 265)',
  surfaceRaised: 'oklch(0.212 0.024 265)',
  surfaceOverlay: 'oklch(0.252 0.026 265)',
  surfaceInset: 'oklch(0.155 0.022 265)',

  borderSubtle: 'oklch(0.29 0.022 265)',
  borderStrong: 'oklch(0.4 0.026 265)',

  // Contrast on surfaceBase: primary ~15:1, secondary ~7.5:1, muted ~4.6:1.
  textPrimary: 'oklch(0.97 0.004 265)',
  textSecondary: 'oklch(0.785 0.013 265)',
  textMuted: 'oklch(0.635 0.016 265)',

  // Equal lightness, so no domain accent dominates the others.
  accentTasks: 'oklch(0.7 0.15 250)',
  accentHabits: 'oklch(0.72 0.13 175)',
  accentFinance: 'oklch(0.72 0.15 162)',
  accentTrading: 'oklch(0.7 0.16 300)',

  accentContrast: 'oklch(0.145 0.021 265)',
  accentSoft: 'oklch(0.7 0.15 250 / 0.14)',

  positive: 'oklch(0.755 0.155 162)',
  positiveSoft: 'oklch(0.755 0.155 162 / 0.13)',
  negative: 'oklch(0.685 0.185 22)',
  negativeSoft: 'oklch(0.685 0.185 22 / 0.13)',
  warning: 'oklch(0.8 0.145 78)',
  warningSoft: 'oklch(0.8 0.145 78 / 0.13)',

  focusRing: 'oklch(0.8 0.13 250)',
} as const;

/** Considered values, not an automatic inversion of the dark set. */
export const light = {
  surfaceSunken: 'oklch(0.955 0.005 265)',
  surfaceBase: 'oklch(0.985 0.003 265)',
  surfaceRaised: 'oklch(1 0 0)',
  surfaceOverlay: 'oklch(1 0 0)',
  surfaceInset: 'oklch(0.968 0.005 265)',

  borderSubtle: 'oklch(0.905 0.008 265)',
  borderStrong: 'oklch(0.795 0.014 265)',

  textPrimary: 'oklch(0.215 0.02 265)',
  textSecondary: 'oklch(0.435 0.018 265)',
  textMuted: 'oklch(0.555 0.017 265)',

  accentTasks: 'oklch(0.545 0.175 253)',
  accentHabits: 'oklch(0.545 0.115 178)',
  accentFinance: 'oklch(0.525 0.145 162)',
  accentTrading: 'oklch(0.545 0.195 300)',

  accentContrast: 'oklch(1 0 0)',
  accentSoft: 'oklch(0.545 0.175 253 / 0.1)',

  positive: 'oklch(0.515 0.145 162)',
  positiveSoft: 'oklch(0.515 0.145 162 / 0.1)',
  negative: 'oklch(0.535 0.195 25)',
  negativeSoft: 'oklch(0.535 0.195 25 / 0.1)',
  warning: 'oklch(0.575 0.135 70)',
  warningSoft: 'oklch(0.575 0.135 70 / 0.12)',

  focusRing: 'oklch(0.545 0.175 253)',
} as const;

/**
 * The shape both themes satisfy. Widened to `string` on purpose: the literal
 * type of `dark` would make `light` — a different set of values for the same
 * names — fail to be a `ColorScheme` at all.
 */
export type ColorScheme = Record<keyof typeof dark, string>;
export const themes = { dark, light } as const;
