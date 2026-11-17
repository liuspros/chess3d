/* Inline SVG icon set. Stroke icons inherit currentColor; piece icons are filled silhouettes. */

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }

function Svg({ size = 20, children, filled, className, style, title, viewBox = '0 0 24 24' }) {
  return (
    <svg
      className={`ico ${className || ''}`}
      width={size}
      height={size}
      viewBox={viewBox}
      aria-hidden={title ? undefined : 'true'}
      role={title ? 'img' : undefined}
      style={style}
      {...(filled ? { fill: 'currentColor' } : S)}
    >
      {title && <title>{title}</title>}
      {children}
    </svg>
  )
}

const P = (d, extra) => <path d={d} {...extra} />

export const ICONS = {
  undo: (
    <>
      {P('M9 14 4 9l5-5')}
      {P('M4 9h10.5a5.5 5.5 0 0 1 0 11H11')}
    </>
  ),
  flip: (
    <>
      {P('M3 12a9 9 0 1 0 3-6.7L3 8')}
      {P('M3 3v5h5')}
    </>
  ),
  moves: P('M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01'),
  flag: P('M5 22V3.5M5 4h13l-2.5 4.5L18 13H5'),
  home: (
    <>
      {P('M3 11.5 12 4l9 7.5')}
      {P('M5.5 10v10h4.5v-6h4v6h4.5V10')}
    </>
  ),
  bulb: (
    <>
      {P('M9.5 18.5h5M10.5 21.5h3')}
      {P('M12 2.5a6.5 6.5 0 0 0-3.9 11.7c.6.5.9 1.2.9 2h6c0-.8.3-1.5.9-2A6.5 6.5 0 0 0 12 2.5z')}
    </>
  ),
  equals: P('M5 9h14M5 15h14'),
  close: P('M6 6l12 12M18 6 6 18'),
  back: P('M19 12H5M11 5l-7 7 7 7'),
  check: P('M4.5 12.5l5 5L19.5 7'),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      {P('M4 21c0-4.2 3.6-6.5 8-6.5s8 2.3 8 6.5')}
    </>
  ),
  first: P('M6 5v14M18 6l-8 6 8 6z'),
  prev: P('M17 6l-8 6 8 6z'),
  next: P('M7 6l8 6-8 6z'),
  last: P('M18 5v14M6 6l8 6-8 6z'),
  bolt: P('M13 2.5 4.5 14H11l-1 7.5L19.5 10H13z'),
  sparkle: P('M12 3l2.2 6.3L21 12l-6.8 2.7L12 21l-2.2-6.3L3 12l6.8-2.7z'),
  play: P('M7 4.5l12 7.5-12 7.5z'),
  star: P('M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z'),
  trophy: (
    <>
      {P('M8 4h8v5a4 4 0 0 1-8 0z')}
      {P('M8 6H4.5c0 3 1.2 4.5 3.5 5M16 6h3.5c0 3-1.2 4.5-3.5 5')}
      {P('M12 13v4M8.5 20h7M10 17h4')}
    </>
  ),
  puzzle: P('M10 4h4v3a2 2 0 1 0 0 4v3h-4v-1.5a2 2 0 1 0-4 0V14H3V8h3v1a2 2 0 1 0 4 0z'),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      {P('M12 7v5l3 2')}
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      {P('M2.5 20c0-3.6 2.9-5.5 6.5-5.5s6.5 1.9 6.5 5.5')}
      {P('M16 4.8a3.5 3.5 0 0 1 0 6.4M18.5 14.8c1.8.7 3 2.2 3 4.7')}
    </>
  ),
  cpu: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="2" />
      {P('M9 2.5v3M15 2.5v3M9 18.5v3M15 18.5v3M2.5 9h3M2.5 15h3M18.5 9h3M18.5 15h3')}
    </>
  ),
  chat: P('M4 5.5h16v11H10l-5 4v-4H4z'),
  send: P('M4 12 20 4l-4 16-4.5-6.5zM11.5 13.5 20 4'),
  thumb: (
    <>
      {P('M7 11v9H4v-9z')}
      {P('M7 11l4-7c1.6 0 2.6 1.1 2.1 3l-.6 3H19a1.6 1.6 0 0 1 1.6 1.9l-1.2 6A2 2 0 0 1 17.4 20H7')}
    </>
  ),
  heart: P('M12 20s-7.5-4.5-7.5-10.2A4.1 4.1 0 0 1 12 7.6a4.1 4.1 0 0 1 7.5 2.2C19.5 15.5 12 20 12 20z'),
  smile: (
    <>
      <circle cx="12" cy="12" r="9" />
      {P('M8.5 14c1 1.5 2.2 2.2 3.5 2.2s2.5-.7 3.5-2.2M9 9.5h.01M15 9.5h.01')}
    </>
  ),
  oops: (
    <>
      <circle cx="12" cy="12" r="9" />
      {P('M8.5 16.5c1-1.5 2.2-2.2 3.5-2.2s2.5.7 3.5 2.2M9 9.5h.01M15 9.5h.01')}
    </>
  ),
  wow: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="15.5" r="1.7" />
      {P('M9 9.5h.01M15 9.5h.01')}
    </>
  ),
  think: (
    <>
      <circle cx="12" cy="12" r="9" />
      {P('M9.6 9.6a2.5 2.5 0 1 1 3.9 2c-.9.6-1.5 1.1-1.5 2.2M12 16.8h.01')}
    </>
  ),
  download: (
    <>
      {P('M12 3v12M7 10.5l5 5 5-5')}
      {P('M4 20h16')}
    </>
  ),
  share: (
    <>
      <circle cx="18" cy="5.5" r="2.5" />
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="18.5" r="2.5" />
      {P('M8.2 10.8l7.6-4.1M8.2 13.2l7.6 4.1')}
    </>
  ),
}

export function Icon({ name, size, className, style, title }) {
  return (
    <Svg size={size} className={className} style={style} title={title}>
      {ICONS[name]}
    </Svg>
  )
}

/* ---------- chess piece silhouettes (original artwork) ---------- */
const PIECES = {
  p: (
    <>
      <circle cx="12" cy="6.6" r="3.2" />
      {P('M9.6 10.8h4.8c.1 2 1 3.3 2.3 4.7.6.7.9 1.3.9 2H6.4c0-.7.3-1.3.9-2 1.3-1.4 2.2-2.7 2.3-4.7z')}
      <rect x="5.2" y="18.3" width="13.6" height="2.7" rx="1.1" />
    </>
  ),
  r: (
    <>
      {P('M6 3h2.9v2h2.2V3h1.8v2h2.2V3H18v5.2l-2 1.6v5.5l2 1.9V19H6v-1.8l2-1.9V9.8L6 8.2z')}
      <rect x="5" y="19" width="14" height="2.4" rx="1" />
    </>
  ),
  n: (
    <>
      {P('M6.4 19c.2-3 1.6-5.2 4-6.9-1.2-.3-2.5-.9-3.5-.5L4.6 12 4 10.3 9.7 3.8 11.2 5C16.2 4.5 19 8.2 19 13.2c0 2-.4 3.8-.9 5.8z')}
      <circle cx="10.3" cy="8.4" r=".9" fill="var(--eye, #1c140e)" />
      <rect x="5.4" y="19" width="13.6" height="2.4" rx="1" />
    </>
  ),
  b: (
    <>
      {P('M12 2.4c1 0 1.7.7 1.7 1.6 0 .5-.2.9-.5 1.2 2 1.4 3.3 3.2 3.3 5.4 0 1.6-.8 2.9-2 3.7l.8 2.2H8.7l.8-2.2c-1.2-.8-2-2.1-2-3.7 0-2.2 1.3-4 3.3-5.4-.3-.3-.5-.7-.5-1.2 0-.9.7-1.6 1.7-1.6z')}
      {P('M7.2 17.2h9.6l1.4 1.8H5.8z')}
      <rect x="5" y="19" width="14" height="2.4" rx="1" />
    </>
  ),
  q: (
    <>
      <circle cx="4.6" cy="7.6" r="1.5" />
      <circle cx="9" cy="4.8" r="1.5" />
      <circle cx="15" cy="4.8" r="1.5" />
      <circle cx="19.4" cy="7.6" r="1.5" />
      {P('M4.6 9.4l3.2 7.4h8.4l3.2-7.4-4 3.2L12 6.6 8.6 12.6z')}
      <rect x="5.6" y="17.2" width="12.8" height="2" rx="1" />
      <rect x="5" y="19.4" width="14" height="2" rx="1" />
    </>
  ),
  k: (
    <>
      {P('M11.1 1.6h1.8v1.9h1.9v1.8h-1.9v1.9h-1.8V5.3H9.2V3.5h1.9z')}
      {P('M12 8.4c4 0 7 2.5 7 6 0 1.6-.7 2.7-1.5 3.6h-11C5.7 17.1 5 16 5 14.4c0-3.5 3-6 7-6z')}
      <rect x="5.4" y="18" width="13.2" height="3.4" rx="1.2" />
    </>
  ),
}

export function PieceIcon({ type, size = 20, className, style }) {
  return (
    <Svg size={size} filled className={className} style={style}>
      {PIECES[type]}
    </Svg>
  )
}

/* Google "G" in the official four brand colours */
export function GoogleLogo({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" className="ico">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}
