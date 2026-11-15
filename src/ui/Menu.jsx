import { LEVELS } from '../game/engine.js'
import { TIME_CONTROLS } from '../game/useChessGame.js'

function Seg({ value, options, onChange }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
          {o.sub && <small>{o.sub}</small>}
        </button>
      ))}
    </div>
  )
}

export default function Menu({ prefs, setPrefs, onStart, onResume, canResume, engineError, autoTierName }) {
  const set = (k) => (v) => setPrefs({ ...prefs, [k]: v })
  return (
    <div className="overlay menu">
      <div className="panel menu-panel">
        <div className="brand">
          <div className="crest">♞</div>
          <h1>CHESS 3D</h1>
          <p>Marble. Walnut. Ebony. Play like it's on a real board.</p>
        </div>

        <label>Mode</label>
        <Seg
          value={prefs.mode}
          onChange={set('mode')}
          options={[
            { value: 'bot', label: 'vs Computer' },
            { value: 'local', label: 'Pass & Play' },
          ]}
        />

        {prefs.mode === 'bot' && (
          <>
            <label>Play as</label>
            <Seg
              value={prefs.color}
              onChange={set('color')}
              options={[
                { value: 'w', label: 'White' },
                { value: 'r', label: 'Random' },
                { value: 'b', label: 'Black' },
              ]}
            />
            <label>Difficulty</label>
            <Seg
              value={prefs.level}
              onChange={set('level')}
              options={LEVELS.map((l) => ({ value: l.id, label: l.name, sub: l.elo }))}
            />
          </>
        )}

        {prefs.mode === 'local' && (
          <>
            <label>Board</label>
            <Seg
              value={prefs.autoFlip ? 'flip' : 'fixed'}
              onChange={(v) => setPrefs({ ...prefs, autoFlip: v === 'flip' })}
              options={[
                { value: 'flip', label: 'Turn to each player' },
                { value: 'fixed', label: 'Fixed view' },
              ]}
            />
          </>
        )}

        <label>Time</label>
        <Seg
          value={prefs.time}
          onChange={set('time')}
          options={TIME_CONTROLS.map((t) => ({ value: t.id, label: t.label }))}
        />

        <label>Graphics</label>
        <Seg
          value={prefs.graphics}
          onChange={set('graphics')}
          options={[
            { value: 'auto', label: 'Auto', sub: autoTierName },
            { value: 'high', label: 'High' },
            { value: 'medium', label: 'Medium' },
            { value: 'low', label: 'Low' },
            { value: '2d', label: '2D' },
          ]}
        />

        <label>Sound</label>
        <Seg
          value={prefs.sound ? 'on' : 'off'}
          onChange={(v) => setPrefs({ ...prefs, sound: v === 'on' })}
          options={[
            { value: 'on', label: 'On' },
            { value: 'off', label: 'Off' },
          ]}
        />

        {engineError && prefs.mode === 'bot' && (
          <div className="warn">The chess engine could not load. The computer will play random moves.</div>
        )}

        <div className="row gap menu-actions">
          <button className="btn gold big" onClick={onStart}>Start game</button>
          {canResume && (
            <button className="btn big" onClick={onResume}>Resume</button>
          )}
        </div>
      </div>
    </div>
  )
}
