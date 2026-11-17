import { Icon } from './Icons.jsx'
import { useEffect, useMemo, useState } from 'react'
import { CATALOG, BY_ID, expand, usd } from '../data/catalog.js'
import { formatMoney, getQuote, startCheckout } from '../shop/api.js'

const KIND_TABS = [
  { id: 'board', label: 'Boards' },
  { id: 'pieces', label: 'Pieces' },
  { id: 'bundle', label: 'Bundles' },
]

// small swatch built from the item id so cards have a visual without extra images
const SWATCH = {
  board_classic: ['#f3efe6', '#8d5b36'], board_onyx: ['#f6f4ee', '#18181c'], board_jade: ['#c4dec8', '#18523a'], board_burl: ['#e2b878', '#703f24'],
  board_adire: ['#eee8d6', '#162a5c'], board_gold: ['#d8ae58', '#0e1022'],
  set_classic: ['#f7f4ec', '#2a1d16'], set_modern: ['#e8e6e0', '#34363c'], set_obsidian: ['#f0e4cc', '#0e0e12'], set_jade: ['#f6f4ec', '#146042'],
  set_bronze: ['#c4804a', '#3a2c22'], set_glass: ['#e4f2fa', '#242834'], set_gold: ['#d6b05c', '#c4c8d0'],
}
const Swatch = ({ id }) => {
  const it = BY_ID[id]
  const parts = it.kind === 'bundle' ? it.includes.slice(0, 2) : [id]
  return (
    <div className="swatch">
      {parts.map((p) => {
        const [a, b] = SWATCH[p] || ['#ccc', '#333']
        const board = BY_ID[p].kind === 'board'
        return board ? (
          <i key={p} className="sw-board" style={{ background: `conic-gradient(${a} 25%, ${b} 0 50%, ${a} 0 75%, ${b} 0)`, backgroundSize: '50% 50%' }} />
        ) : (
          <i key={p} className="sw-piece" style={{ background: `radial-gradient(circle at 35% 30%, ${a}, ${b} 85%)` }} />
        )
      })}
    </div>
  )
}

export function Shop({ auth, owned, equipped, onEquip, onPreview, onBack, notice }) {
  const [tab, setTab] = useState('board')
  const [buying, setBuying] = useState(null) // item id being confirmed
  const [quote, setQuote] = useState(null)
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const items = useMemo(() => CATALOG.filter((i) => i.kind === tab), [tab])
  const guest = auth.user?.isAnonymous

  useEffect(() => {
    if (!buying) return
    let dead = false
    setQuote(null)
    setErr(null)
    getQuote([buying]).then((q) => !dead && setQuote(q)).catch((e) => !dead && setErr(e.message))
    return () => {
      dead = true
    }
  }, [buying])

  const pay = async () => {
    setBusy(true)
    setErr(null)
    try {
      const r = await startCheckout([buying])
      window.location.href = r.url
    } catch (e) {
      setErr(e.message)
      setBusy(false)
    }
  }

  const isOwned = (it) => it.free || (it.kind === 'bundle' ? it.includes.every((x) => owned.has(x)) : owned.has(it.id))

  if (buying) {
    const it = BY_ID[buying]
    return (
      <div className="panel sheet">
        <div className="sheet-head">
          <button className="btn small" onClick={() => setBuying(null)} aria-label="Back"><Icon name="back" size={16} /></button>
          <h2>Checkout</h2>
        </div>
        <div className="li" style={{ marginTop: 8 }}>
          <Swatch id={buying} />
          <span className="nm">{it.name}<br /><span className="sub">{expand([buying]).length > 1 ? `${expand([buying]).length} items` : it.kind === 'board' ? 'Board' : 'Piece set'}</span></span>
          <span className="rt">{usd(it.usd)}</span>
        </div>
        {guest ? (
          <div className="warn">Guest accounts can’t buy, because the purchase would be lost with the guest. Create a free account first.</div>
        ) : (
          <>
            <div className="statrow" style={{ gridTemplateColumns: '1fr', margin: '14px 0 4px' }}>
              <div className="stat">
                <small>You will pay</small>
                <b>{quote ? formatMoney(quote.amount, quote.currency) : '…'}</b>
                <small style={{ textTransform: 'none', letterSpacing: 0 }}>{quote && quote.currency !== 'USD' ? `${usd(it.usd)} converted to ${quote.currency} at today’s rate` : 'Price in US dollars'}</small>
              </div>
            </div>
            <p className="hint">Secure payment by Paystack: card, bank transfer or USSD. Your item unlocks the moment payment is confirmed.</p>
            {err && <div className="warn">{err}</div>}
            <button className="btn gold big" style={{ width: '100%', marginTop: 10 }} disabled={!quote || busy} onClick={pay}>
              {busy ? 'Opening Paystack…' : 'Pay with Paystack'}
            </button>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="panel sheet">
      <div className="sheet-head">
        <button className="btn small" onClick={onBack} aria-label="Back"><Icon name="back" size={16} /></button>
        <h2>Shop</h2>
      </div>
      {notice && <div className="note">{notice}</div>}
      <div className="seg" style={{ marginTop: 8 }}>
        {KIND_TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>
      <div className="list" style={{ marginTop: 12 }}>
        {items.map((it) => {
          const have = isOwned(it)
          const on = equipped.board === it.id || equipped.pieces === it.id
          return (
            <div key={it.id} className={`li shop ${on ? 'me' : ''}`}>
              <Swatch id={it.id} />
              <span className="nm" style={{ whiteSpace: 'normal' }}>
                {it.name} {it.tag && <span className="tagpill">{it.tag}</span>}
                <br />
                <span className="sub">{it.desc}</span>
              </span>
              <span className="shop-act">
                {it.kind !== 'bundle' && <button className="btn small" onClick={() => onPreview(it)}>Preview</button>}
                {have ? (
                  it.kind === 'bundle' ? <span className="sub">Owned</span> : <button className={`btn small ${on ? '' : 'gold'}`} disabled={on} onClick={() => onEquip(it)}>{on ? 'Equipped' : 'Equip'}</button>
                ) : (
                  <button className="btn small gold" onClick={() => (auth.profile ? setBuying(it.id) : onBack('auth'))}>{usd(it.usd)}</button>
                )}
              </span>
            </div>
          )
        })}
      </div>
      <p className="hint" style={{ marginTop: 12 }}>Prices are shown in USD and charged in your local currency at checkout.</p>
    </div>
  )
}
