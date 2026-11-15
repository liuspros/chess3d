import { genMarble, genWood } from './texgen.js'

self.onmessage = (e) => {
  const { id, kind, size, opts } = e.data
  const r = kind === 'marble' ? genMarble(size, opts) : genWood(size, opts)
  self.postMessage({ id, color: r.color, height: r.height }, [r.color.buffer, r.height.buffer])
}
