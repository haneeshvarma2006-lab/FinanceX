import { brand } from '@/lib/brand';

/**
 * Runs before first paint: the splash shows once per browser session, so a
 * reload or a second tab goes straight to the page. Storage that throws
 * (private modes, blocked site data) just means the splash shows again.
 */
const ONCE_PER_SESSION = `try{var s=sessionStorage;if(s.getItem('nf-splash'))document.documentElement.dataset.splash='seen';else s.setItem('nf-splash','1')}catch(e){}`;

/**
 * The opening splash: the mark draws itself — the outer square, the inner
 * one, then the flow line through both — the name settles in beneath it,
 * and the whole layer fades away.
 *
 * It is CSS only, so it plays and leaves on its own even before the page's
 * JavaScript arrives, and it never takes a tap: pointer events pass straight
 * through to the page underneath. The name comes from CSS `content`, not text
 * nodes, so it is not a second copy of the wordmark for search or assistive
 * technology — the layer is decoration and is hidden from both.
 */
export function Splash({ nonce }: { nonce?: string }) {
  return (
    <>
      <script nonce={nonce} dangerouslySetInnerHTML={{ __html: ONCE_PER_SESSION }} />
      <div aria-hidden className="nf-splash" data-testid="splash">
        <div className="nf-splash-stack">
          <svg viewBox="0 0 64 64" className="nf-splash-mark" fill="none">
            <rect className="nf-splash-tile" width="64" height="64" rx="14" />
            <g strokeLinecap="round" strokeLinejoin="round">
              <rect
                className="nf-splash-outer"
                pathLength={1}
                x="13"
                y="13"
                width="38"
                height="38"
                rx="11"
                strokeWidth="2.5"
              />
              <rect
                className="nf-splash-inner"
                pathLength={1}
                x="22"
                y="22"
                width="20"
                height="20"
                rx="6"
                strokeWidth="2.5"
              />
              <path
                className="nf-splash-flow"
                pathLength={1}
                d="M14 44c8 0 10-24 18-24s10 24 18 24"
                strokeWidth="3.5"
              />
            </g>
          </svg>
          <span
            className="nf-splash-word"
            data-lead={brand.wordmark.lead}
            data-accent={brand.wordmark.accent}
          />
          <span className="nf-splash-tagline" data-text={brand.category} />
        </div>
      </div>
    </>
  );
}
