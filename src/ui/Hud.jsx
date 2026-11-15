import { useEffect, useRef } from 'react'

const GLYPH = { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' }
const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }

export function fmtClock(ms) {
  if (ms == null) return null
  const s = Math.ceil(ms / 1000)
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

export function PlayerBar({ name, sub, color, clock, active, capturedTypes, advantage, thinking, away }) {
  const low = clock != null && clock < 30000
  return (
    <div className={`pbar ${active ? 'active' : ''}`}>
      <div className={`avatar ${color}`}>{color === 'w' ? '♔' : '♚'}</div>
      <div className="pinfo">
        <div className="pname">
          {name}
          {thinking && <span className="dots"><i /><i /><i /></span>}
          {away && <span className="off">OFFLINE</span>}
        </div>
        <div className="psub">
          <span className="taken">
            {[...capturedTypes]
              .sort((a, b) => VALUE[b] - VALUE[a])
              .map((t, i) => (
                <span key={i} className={color === 'w' ? 'tb' : 'tw'}>{GLYPH[t]}</span>
              ))}
          </span>
          {advantage > 0 && <span className="adv">+{advantage}</span>}
          {!capturedTypes.length && sub}
        </div>
      </div>
      {clock != null && <div className={`clock ${active ? 'on' : ''} ${low ? 'low' : ''}`}>{fmtClock(clock)}</div>}
    </div>
  )
}

export function MoveList({ moves, open, onClose, current, onPick }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight
  }, [moves.length, open])
  const rows = []
  for (let i = 0; i < moves.length; i += 2) rows.push([moves[i], moves[i + 1]])
  return (
    <aside className={`moves ${open ? 'open' : ''}`}>
      <div className="moves-head">
        <span>Moves</span>
        <button className="x" onClick={onClose} aria-label="Close moves">✕</button>
      </div>
      <div className="moves-body" ref={ref}>
        {rows.length === 0 && <div className="empty">No moves yet</div>}
        {rows.map((r, i) => (
          <div className="mrow" key={i}>
            <span className="mnum">{i + 1}.</span>
            <button className={`mv ${current === i * 2 + 1 ? 'cur' : ''}`} onClick={() => onPick?.(i * 2 + 1)}>{r[0]?.san}</button>
            <button className={`mv ${current === i * 2 + 2 ? 'cur' : ''}`} onClick={() => r[1] && onPick?.(i * 2 + 2)}>{r[1]?.san || ''}</button>
          </div>
        ))}
      </div>
    </aside>
  )
}

export function PromotionDialog({ color, onPick, onCancel }) {
  const opts = ['q', 'r', 'b', 'n']
  return (
    <div className="overlay center" onClick={onCancel}>
      <div className="panel promo" onClick={(e) => e.stopPropagation()}>
        <div className="panel-title">Promote to</div>
        <div className="promo-row">
          {opts.map((t) => (
            <button key={t} className={`promo-btn ${color}`} onClick={() => onPick(t)}>
              {GLYPH[t]}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export function GameOver({ result, settings, settled, onRematch, onMenu, onDismiss, onReview, rematchLabel = 'Rematch', myColor }) {
  const { winner, reason } = result
  let title = 'Draw'
  const me = settings?.mode === 'bot' || settings?.mode === 'online' ? settings.playerColor : null
  if (winner) {
    if (me) title = winner === me ? 'You win!' : 'You lose'
    else title = `${winner === 'w' ? 'White' : 'Black'} wins`
  }
  const why = {
    checkmate: 'by checkmate',
    timeout: 'on time',
    resignation: 'by resignation',
    abandoned: 'opponent left',
  }[reason] || `· ${reason}`
  return (
    <div className="overlay center">
      <div className="panel over">
        <div className="over-title">{title}</div>
        <div className="over-sub">{winner ? why : reason}</div>
        {settled && (
          <div className={`over-elo delta ${settled.delta >= 0 ? 'pos' : 'neg'}`}>
            {settled.rated ? `${settled.delta >= 0 ? '+' : ''}${settled.delta} Elo · ${settled.rating}` : 'Unrated (too short)'}
          </div>
        )}
        <div className="row gap wrap" style={{ justifyContent: 'center' }}>
          {onRematch && <button className="btn gold" onClick={onRematch}>{rematchLabel}</button>}
          <button className="btn" onClick={onReview}>Review</button>
          <button className="btn" onClick={onMenu}>Home</button>
        </div>
        <button className="link" onClick={onDismiss}>View board</button>
      </div>
    </div>
  )
}
