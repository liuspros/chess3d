import { CLASSES, uciToSan } from '../game/review.js'

export function EvalGraph({ pct, ply, onSeek }) {
  const n = pct.length - 1
  const W = 300
  const H = 74
  const x = (i) => (n ? (i / n) * W : 0)
  const y = (p) => H - (p / 100) * H
  const line = pct.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p).toFixed(1)}`).join(' ')
  const area = `${line} L${W},${H} L0,${H} Z`
  const seek = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    onSeek(Math.round(((e.clientX - r.left) / r.width) * n))
  }
  return (
    <svg className="evalgraph" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" onPointerDown={seek} onPointerMove={(e) => e.buttons === 1 && seek(e)} role="img" aria-label="Evaluation graph">
      <rect x="0" y="0" width={W} height={H} fill="#1a120c" />
      <path d={area} fill="#efe6d4" />
      <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="#8d5b36" strokeWidth="0.6" strokeDasharray="3 3" />
      <path d={line} fill="none" stroke="#d8b46a" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
      <line x1={x(ply)} x2={x(ply)} y1="0" y2={H} stroke="#ff6a4d" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export function ReviewPanel({ analysis, progress, ply, total, onSeek, onClose, onExit }) {
  const mv = analysis && ply > 0 ? analysis.cls[ply - 1] : null
  const cl = mv ? CLASSES[mv.cls] : null
  const before = analysis && ply > 0 ? analysis.fens[ply - 1] : null
  return (
    <div className="dock">
      <div className="panel dockpanel">
        {!analysis ? (
          <>
            <div className="panel-title">Analysing with Stockfish…</div>
            <div className="bar"><i style={{ width: `${Math.round(progress * 100)}%` }} /></div>
          </>
        ) : (
          <>
            <EvalGraph pct={analysis.pct} ply={ply} onSeek={onSeek} />
            <div className="revline">
              {mv ? (
                <>
                  <b>{Math.ceil(ply / 2)}{ply % 2 ? '.' : '…'} {mv.san}</b>
                  <span className="badge" style={{ background: cl.color }}>{cl.icon} {cl.label}</span>
                  {mv.cls !== 'best' && mv.best && <span style={{ color: 'var(--muted)' }}>Best: <b style={{ color: 'var(--gold-2)' }}>{uciToSan(before, mv.best)}</b></span>}
                </>
              ) : (
                <span style={{ color: 'var(--muted)' }}>Start position. Tap the graph or use the arrows.</span>
              )}
            </div>
            <div className="acc">
              <span>White accuracy <b>{analysis.accuracy.w ?? '–'}</b></span>
              <span>Black accuracy <b>{analysis.accuracy.b ?? '–'}</b></span>
            </div>
          </>
        )}
        <div className="row gap" style={{ marginTop: 10 }}>
          <button className="btn small" disabled={ply <= 0} onClick={() => onSeek(0)}>⏮</button>
          <button className="btn small" style={{ flex: 1 }} disabled={ply <= 0} onClick={() => onSeek(ply - 1)}>◀ Prev</button>
          <button className="btn small" style={{ flex: 1 }} disabled={ply >= total} onClick={() => onSeek(ply + 1)}>Next ▶</button>
          <button className="btn small" disabled={ply >= total} onClick={() => onSeek(total)}>⏭</button>
          <button className="btn small" onClick={onExit}>Done</button>
        </div>
      </div>
    </div>
  )
}

export function PuzzlePanel({ puzzle, index, status, onHint, onSolution, onNext, onRetry, onExit, hintUsed }) {
  const side = puzzle.side === 'w' ? 'White' : 'Black'
  return (
    <div className="dock">
      <div className="panel dockpanel">
        <div className="revline" style={{ marginTop: 0 }}>
          <b>Puzzle {index + 1}</b>
          <span className="badge" style={{ background: 'var(--gold)' }}>{puzzle.theme}</span>
          <span style={{ color: 'var(--muted)', marginLeft: 'auto' }}>{puzzle.rating}</span>
        </div>
        <div style={{ color: 'var(--muted)', fontSize: 13 }}>
          {status === 'solved' ? 'Solved. Nice one.' : status === 'wrong' ? 'Not that one. Try again.' : `${side} to move. Find the best move.`}
        </div>
        <div className="row gap" style={{ marginTop: 10 }}>
          {status === 'solved' ? (
            <button className="btn gold big" onClick={onNext}>Next puzzle</button>
          ) : (
            <>
              <button className="btn small" style={{ flex: 1 }} onClick={onHint}>{hintUsed ? 'Hint ✓' : 'Hint'}</button>
              <button className="btn small" style={{ flex: 1 }} onClick={onSolution}>Show move</button>
              <button className="btn small" style={{ flex: 1 }} onClick={onRetry}>Restart</button>
            </>
          )}
          <button className="btn small" onClick={onExit}>Exit</button>
        </div>
      </div>
    </div>
  )
}
