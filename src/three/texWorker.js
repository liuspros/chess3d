import { genTexture } from './texgen.js'

self.onmessage = (e) => {
  const { id, kind, size, opts } = e.data
  const r = genTexture(kind, size, opts)
  self.postMessage({ id, color: r.color, height: r.height }, [r.color.buffer, r.height.buffer])
}
