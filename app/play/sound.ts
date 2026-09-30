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
  // фоновая вкладка: игра на паузе (rAF стоит) — звук тоже замолкает, а не играет в пустоту
  document.addEventListener('visibilitychange', () => void (document.hidden ? ac?.suspend() : ac?.resume()))
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

// ---------- музыка: генеративный lo-fi без файлов ----------
// 84 BPM, Cmaj7 → Am7 → Fmaj7 → G7; мелодия из пентатоники по сиду дня, так что у каждого дня своя.
// Игра управляет звучанием: к земле закрывается фильтр (глухо, как под водой), в пике хэт вдвое чаще, в грозе пэд расстраивается
const BPM = 84
const EIGHTH = 60 / BPM / 2
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12)
const CHORDS = [[48, 52, 55, 59], [45, 48, 52, 55], [41, 45, 48, 52], [43, 47, 50, 53]] // C3 E G B · A2 C E G · F2 A C E · G2 B D F
const PENTA = [72, 74, 76, 79, 81, 84, 86, 88] // C5 D E G A C6 D E

type Music = { bus: GainNode; filter: BiquadFilterNode; timer: ReturnType<typeof setInterval>; next: number; step: number; melody: (number | null)[] }
let music: Music | null = null
const mood = { alt: 100, diving: false, storm: false }

function voice(type: OscillatorType, freq: number, at: number, dur: number, gain: number, attack = 0.01, detune = 0) {
  if (!ac || !music) return
  const o = ac.createOscillator()
  o.type = type
  o.frequency.value = freq
  o.detune.value = detune
  const g = ac.createGain()
  g.gain.setValueAtTime(0, at)
  g.gain.linearRampToValueAtTime(gain, at + attack)
  g.gain.exponentialRampToValueAtTime(0.0008, at + dur)
  o.connect(g).connect(music.filter)
  o.start(at)
  o.stop(at + dur + 0.05)
}

function hat(at: number) {
  if (!ac || !music) return
  const src = ac.createBufferSource()
  src.buffer = noise(ac, 0.05)
  const f = ac.createBiquadFilter()
  f.type = 'highpass'
  f.frequency.value = 7000
  const g = ac.createGain()
  g.gain.setValueAtTime(0.035, at)
  g.gain.exponentialRampToValueAtTime(0.001, at + 0.05)
  src.connect(f).connect(g).connect(music.filter)
  src.start(at)
}

function schedule() {
  if (!ac || !music) return
  while (music.next < ac.currentTime + 0.15) {
    const at = music.next
    const s = music.step
    const bar = Math.floor(s / 8) % CHORDS.length
    const chord = CHORDS[bar]
    const beat = s % 8
    if (beat === 0) chord.forEach((n) => voice('triangle', hz(n), at, EIGHTH * 8, 0.035, 0.35, mood.storm ? 35 : 0))
    if (beat === 0 || beat === 4) {
      voice('sine', hz(chord[0] - 12), at, EIGHTH * 3, 0.12, 0.01) // бас
      voice('sine', 62, at, 0.18, 0.22, 0.005) // бочка
    }
    if (beat % 2 === 1 || mood.diving) hat(at)
    const note = music.melody[s % music.melody.length]
    if (note !== null) voice('triangle', hz(note), at, EIGHTH * 1.8, 0.045, 0.005)
    music.next += EIGHTH
    music.step++
  }
  // к земле фильтр закрывается: музыка глохнет вместе с высотой
  music.filter.frequency.setTargetAtTime(350 + mood.alt * 55, ac.currentTime, 0.25)
}

export function startMusic(seed: number) {
  if (!ac || music) return
  let a = seed >>> 0
  const r = () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296)
  const melody = Array.from({ length: 32 }, () => (r() < 0.42 ? PENTA[Math.floor(r() * PENTA.length)] : null))
  const bus = ac.createGain()
  bus.gain.value = muted ? 0 : 0.9
  const filter = ac.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 6000
  filter.connect(bus).connect(ac.destination)
  music = { bus, filter, timer: setInterval(schedule, 50), next: ac.currentTime + 0.1, step: 0, melody }
  schedule()
}

export function setMusic(alt: number, diving: boolean, storm: boolean) {
  mood.alt = alt
  mood.diving = diving
  mood.storm = storm
  if (music && ac) music.bus.gain.setTargetAtTime(muted ? 0 : 0.9, ac.currentTime, 0.1)
}

export function stopMusic() {
  if (!music || !ac) return
  const m = music
  music = null
  clearInterval(m.timer)
  m.bus.gain.setTargetAtTime(0, ac.currentTime, 0.4)
  setTimeout(() => m.bus.disconnect(), 2000)
}
