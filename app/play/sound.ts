// звук без файлов: синтез WebAudio. AudioContext создаём только по жесту игрока
let ac: AudioContext | null = null
let windGain: GainNode | null = null
let muted = false
try {
  muted = typeof localStorage !== 'undefined' && localStorage.getItem('airmail-muted') === '1'
} catch {}

export const isMuted = () => muted
export function setMuted(m: boolean) {
  muted = m
  try {
    localStorage.setItem('airmail-muted', m ? '1' : '0')
  } catch {}
  if (windGain && ac) windGain.gain.setTargetAtTime(0, ac.currentTime, 0.05)
}

function noise(a: AudioContext, seconds: number) {
  const b = a.createBuffer(1, Math.ceil(a.sampleRate * seconds), a.sampleRate)
  const d = b.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  return b
}

export function unlock() {
  if (ac) return void ac.resume()
  try {
    ac = new AudioContext()
  } catch {
    return
  }
  // ветер: петля шума через полосовой фильтр, громкость — от высоты и гроз
  const src = ac.createBufferSource()
  src.buffer = noise(ac, 2)
  src.loop = true
  const bp = ac.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 500
  bp.Q.value = 0.6
  windGain = ac.createGain()
  windGain.gain.value = 0
  src.connect(bp).connect(windGain).connect(ac.destination)
  src.start()
}

export function setWind(level: number) {
  if (!ac || !windGain) return
  windGain.gain.setTargetAtTime(muted ? 0 : 0.015 + 0.05 * level, ac.currentTime, 0.3)
}

export function silence() {
  if (ac && windGain) windGain.gain.setTargetAtTime(0, ac.currentTime, 0.2)
}

function burst(freq: number, q: number, gain: number, dur: number) {
  if (!ac || muted) return
  const t = ac.currentTime
  const src = ac.createBufferSource()
  src.buffer = noise(ac, dur)
  const f = ac.createBiquadFilter()
  f.type = 'bandpass'
  f.frequency.value = freq
  f.Q.value = q
  const g = ac.createGain()
  g.gain.setValueAtTime(gain, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + dur)
  src.connect(f).connect(g).connect(ac.destination)
  src.start(t)
}

function tone(freq: number, to: number, gain: number, dur: number, type: OscillatorType = 'sine', delay = 0) {
  if (!ac || muted) return
  const t = ac.currentTime + delay
  const o = ac.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  o.frequency.exponentialRampToValueAtTime(to, t + dur)
  const g = ac.createGain()
  g.gain.setValueAtTime(gain, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + dur)
  o.connect(g).connect(ac.destination)
  o.start(t)
  o.stop(t + dur + 0.02)
}

// удар резинового штампа: низкий «тук» + шлепок; серия доставок — сверху звенит колокольчик, выше с каждым шагом
export function thud(combo = 1) {
  if (!ac || muted) return
  if (combo > 1) [0, 0.07].forEach((d, i) => tone(660 * 2 ** ((combo - 1 + i * 4) / 12), 660 * 2 ** ((combo - 1 + i * 4) / 12), 0.12, 0.25, 'triangle', d))
  const t = ac.currentTime
  const o = ac.createOscillator()
  o.frequency.setValueAtTime(110, t)
  o.frequency.exponentialRampToValueAtTime(40, t + 0.18)
  const g = ac.createGain()
  g.gain.setValueAtTime(0.7, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.25)
  o.connect(g).connect(ac.destination)
  o.start(t)
  o.stop(t + 0.3)
  burst(900, 0.8, 0.5, 0.06)
}

export const rustle = () => burst(3200, 1.2, 0.12, 0.14)
export const crumple = () => [0, 90, 170, 260].forEach((ms) => setTimeout(() => burst(2000 + Math.random() * 2000, 1, 0.25, 0.12), ms))

// поймал чужое письмо — короткий взлёт тона
export const chirp = () => tone(700, 1500, 0.1, 0.14, 'triangle')
// мало высоты — сухой писк
export const beep = () => tone(1200, 1150, 0.06, 0.07, 'square')
