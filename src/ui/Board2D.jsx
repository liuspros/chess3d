const GLYPH = {
  w: { p: '♙', n: '♘', b: '♗', r: '♖', q: '♕', k: '♔' },
  b: { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' },
}
const FILES = 'abcdefgh'

// Lightweight fallback for very old phones / no WebGL.
export default function Board2D({ pieces, selected, targets, lastMove, checkSquare, onSquare, viewSide }) {
  const bySq = {}
  pieces.forEach((p) => {
    if (!p.captured) bySq[p.square] = p
  })
  const tset = new Map(targets.map((t) => [t.to, t]))
  const ranks = viewSide === 'w' ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7]
  const files = viewSide === 'w' ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0]
  return (
    <div className="b2d-wrap">
      <div className="b2d">
        {ranks.map((r) =>
          files.map((f) => {
            const sq = FILES[f] + (r + 1)
            const light = (f + r) % 2 === 1
            const p = bySq[sq]
            const t = tset.get(sq)
            const cls = [
              'sq',
              light ? 'l' : 'd',
              selected === sq ? 'sel' : '',
              lastMove && (lastMove.from === sq || lastMove.to === sq) ? 'last' : '',
              checkSquare === sq ? 'chk' : '',
            ].join(' ')
            return (
              <button key={sq} className={cls} onClick={() => onSquare(sq)} aria-label={sq}>
                {p && <span className={`pc ${p.color}`}>{GLYPH[p.color][p.type]}</span>}
                {t && <i className={t.capture ? 'ring' : 'dot'} />}
              </button>
            )
          }),
        )}
      </div>
    </div>
  )
}
