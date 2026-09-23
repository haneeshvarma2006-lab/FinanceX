import {
  breakpoints,
  dark,
  light,
  motion,
  radius,
  shadow,
  shadowLight,
  typography,
  type ColorScheme,
} from './index';

/**
 * Turn the token data into the CSS custom properties the web consumes.
 *
 * This exists so the values live in exactly one place. The mobile client will
 * import the objects in `./index` directly; the web gets this generated sheet.
 * Neither client can drift from the other without this file changing, and a
 * test asserts the checked-in sheet still matches what this produces.
 */

/** `surfaceSunken` -> `surface-sunken`. Every token name kebab-cases cleanly. */
function kebab(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

function declare(name: string, value: string): string {
  return `  --${name}: ${value};`;
}

function declareAll(prefix: string, values: Record<string, string>): string[] {
  return Object.entries(values).map(([key, value]) => declare(`${prefix}${kebab(key)}`, value));
}

/**
 * Primitives: the raw scales, exposed to Tailwind via `@theme` so utilities
 * like `text-sm` and `rounded-card` resolve to them.
 */
export function primitivesCss(): string {
  const lines = [
    '@theme {',
    declare('font-sans', typography.fontSans),
    declare('font-mono', typography.fontMono),
    '',
    ...Object.entries(typography.size).flatMap(([key, { size, line }]) => [
      declare(`text-${key}`, size),
      declare(`text-${key}--line-height`, line),
    ]),
    '',
    ...declareAll('tracking-', typography.tracking),
    '',
    ...declareAll('radius-', radius),
    '',
    ...declareAll('shadow-', shadow),
    '',
    ...declareAll('', motion),
    '',
    ...declareAll('breakpoint-', breakpoints),
    '}',
  ];
  return lines.join('\n');
}

/**
 * The semantic layer for one theme.
 *
 * `--accent` is an alias rather than a token: a component asking for "the
 * accent" should follow whatever the active section set, not pin one domain.
 */
function schemeCss(selector: string, colorScheme: 'dark' | 'light', colors: ColorScheme): string[] {
  const declarations = Object.entries(colors).flatMap(([key, value]) => {
    const line = declare(kebab(key), value);
    // Sits with the domain accents it aliases, not appended at the end.
    return key === 'accentTrading' ? [line, '', declare('accent', 'var(--accent-tasks)')] : [line];
  });

  return [`${selector} {`, `  color-scheme: ${colorScheme};`, '', ...declarations, '}'];
}

export function semanticsCss(): string {
  return [
    ...schemeCss(':root', 'dark', dark),
    '',
    ...schemeCss(":root[data-theme='light']", 'light', light),
  ].join('\n');
}

/**
 * Light mode needs its own elevation: the dark set's near-black shadows read
 * as dirt on a white surface.
 */
export function lightShadowCss(): string {
  return [":root[data-theme='light'] {", ...declareAll('shadow-', shadowLight), '}'].join('\n');
}

/**
 * Re-expose the semantic layer as Tailwind colour utilities, so a component
 * writes `bg-surface-raised` rather than `bg-[var(--surface-raised)]`.
 */
const UTILITY_COLORS: Record<string, string> = {
  'surface-sunken': 'surface-sunken',
  'surface-base': 'surface-base',
  'surface-raised': 'surface-raised',
  'surface-overlay': 'surface-overlay',
  'surface-inset': 'surface-inset',
  'border-subtle': 'border-subtle',
  'border-strong': 'border-strong',
  'text-primary': 'text-primary',
  'text-secondary': 'text-secondary',
  'text-muted': 'text-muted',
  accent: 'accent',
  'accent-contrast': 'accent-contrast',
  'accent-soft': 'accent-soft',
  tasks: 'accent-tasks',
  habits: 'accent-habits',
  finance: 'accent-finance',
  trading: 'accent-trading',
  positive: 'positive',
  'positive-soft': 'positive-soft',
  negative: 'negative',
  'negative-soft': 'negative-soft',
  warning: 'warning',
  'warning-soft': 'warning-soft',
};

export function utilitiesCss(): string {
  return [
    '@theme inline {',
    ...Object.entries(UTILITY_COLORS).map(([utility, token]) =>
      declare(`color-${utility}`, `var(--${token})`),
    ),
    '}',
  ].join('\n');
}

export const GENERATED_HEADER = `/**
 * GENERATED FILE — do not edit.
 *
 * Produced by \`packages/tokens\` (\`pnpm --filter @nestedflow/tokens build:css\`).
 * Edit \`packages/tokens/src/index.ts\` instead; a test fails if this file
 * falls out of step with it.
 */`;

export function generateCss(): string {
  return [
    GENERATED_HEADER,
    '',
    primitivesCss(),
    '',
    semanticsCss(),
    '',
    lightShadowCss(),
    '',
    utilitiesCss(),
    '',
  ].join('\n');
}
