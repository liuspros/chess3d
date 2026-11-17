import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icons.jsx'
import { cleanText } from '../lib/chatFilter.js'

export const REACTIONS = [
  { id: 'thumb', icon: 'thumb', label: 'Nice' },
  { id: 'heart', icon: 'heart', label: 'Love it' },
  { id: 'smile', icon: 'smile', label: 'Smile' },
  { id: 'wow', icon: 'wow', label: 'Wow' },
  { id: 'think', icon: 'think', label: 'Hmm' },
  { id: 'oops', icon: 'oops', label: 'Oops' },
  { id: 'gg', text: 'GG', label: 'Good game' },
]
const PHRASES = ['Good move', 'Well played', 'Nice game', 'Good luck', 'Take your time', 'Oops, misclick', 'Thanks', 'Rematch?']

export function ReactionGlyph({ r, size = 22 }) {
  return r.text ? <b className="gg">{r.text}</b> : <Icon name={r.icon} size={size} />
}

/* floating reaction that rises from the sender's side of the screen */
export function ReactionFloat({ reaction, mine }) {
  const [show, setShow] = useState(null)
  const last = useRef(0)
  useEffect(() => {
    if (!reaction || reaction.n === last.current) return
    if (Date.now() - reaction.n > 8000) {
      last.current = reaction.n // stale (e.g. reconnecting)
      return
    }
    last.current = reaction.n
    const r = REACTIONS.find((x) => x.id === reaction.id)
    if (!r) return
    setShow({ r, mine: reaction.c === mine, k: reaction.n })
    const t = setTimeout(() => setShow(null), 2600)
    return () => clearTimeout(t)
  }, [reaction, mine])
  if (!show) return null
  return (
    <div key={show.k} className={`react-float ${show.mine ? 'me' : 'opp'}`}>
      <ReactionGlyph r={show.r} size={34} />
    </div>
  )
}

export function ChatPanel({ open, onClose, messages, me, onSend, onReact, canWrite }) {
  const [text, setText] = useState('')
  const [err, setErr] = useState('')
  const listRef = useRef(null)
  useEffect(() => {
    if (open && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages.length, open])
  if (!open) return null
  const send = async (t) => {
    const v = (t ?? text).trim()
    if (!v) return
    const ok = await onSend(v).catch(() => false)
    if (ok === false) setErr('Slow down a little')
    else {
      setErr('')
      if (t == null) setText('')
    }
    if (ok === false) setTimeout(() => setErr(''), 1500)
  }
  return (
    <div className="chatpanel">
      <div className="chat-head">
        <b>Chat</b>
        <button className="x" onClick={onClose} aria-label="Close chat">
          <Icon name="close" size={16} />
        </button>
      </div>
      <div className="chat-list" ref={listRef}>
        {messages.length === 0 && <div className="chat-empty">Say something nice. Messages disappear when the game ends.</div>}
        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.uid === me ? 'mine' : ''}`}>
            {m.uid !== me && <span className="who">{m.name}</span>}
            <span className="bubble">{cleanText(m.text)}</span>
          </div>
        ))}
      </div>
      {canWrite ? (
        <>
          <div className="react-row">
            {REACTIONS.map((r) => (
              <button key={r.id} onClick={() => onReact(r.id)} aria-label={r.label} title={r.label}>
                <ReactionGlyph r={r} size={20} />
              </button>
            ))}
          </div>
          <div className="phrase-row">
            {PHRASES.map((p) => (
              <button key={p} onClick={() => send(p)}>
                {p}
              </button>
            ))}
          </div>
          <form
            className="chat-input"
            onSubmit={(e) => {
              e.preventDefault()
              send()
            }}
          >
            <input value={text} maxLength={200} onChange={(e) => setText(e.target.value)} placeholder={err || 'Type a message'} aria-label="Message" />
            <button type="submit" aria-label="Send" disabled={!text.trim()}>
              <Icon name="send" size={18} />
            </button>
          </form>
        </>
      ) : (
        <div className="chat-empty">You are watching. Only the players can write.</div>
      )}
    </div>
  )
}

/* short preview when a message arrives and the panel is closed */
export function ChatPreview({ msg, onOpen }) {
  if (!msg) return null
  return (
    <button className="chat-preview" onClick={onOpen}>
      <b>{msg.name}</b> {cleanText(msg.text).slice(0, 60)}
    </button>
  )
}
