import type { SoundId } from './painting-engine'

const STORAGE_KEY = 'coloring.sound'

/**
 * Small synthesised interface sounds, generated locally with WebAudio. No
 * audio files are downloaded or copied from the reference app.
 */
export class SoundPlayer {
  private context: AudioContext | null = null
  private enabled: boolean

  constructor() {
    let stored: string | null = null
    try {
      stored = localStorage.getItem(STORAGE_KEY)
    } catch {
      stored = null
    }
    this.enabled = stored !== 'off'
  }

  get isEnabled(): boolean {
    return this.enabled
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    try {
      localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off')
    } catch {
      // Preference persistence is optional; sound still follows this session.
    }
    if (enabled) this.play('save')
  }

  toggle(): boolean {
    this.setEnabled(!this.enabled)
    return this.enabled
  }

  play(sound: SoundId): void {
    if (!this.enabled) return
    try {
      this.context ??= new AudioContext()
      if (this.context.state === 'suspended') void this.context.resume()
      const ctx = this.context
      const now = ctx.currentTime
      const notes: Array<[number, number, number]> =
        sound === 'fill'
          ? [
              [523.25, 0.05, 0.06],
              [783.99, 0.05, 0.08],
            ]
          : sound === 'undo' || sound === 'redo'
            ? [[392, 0.045, 0.05]]
            : sound === 'clear'
              ? [[330, 0.06, 0.07]]
              : sound === 'stroke'
                ? [[880, 0.018, 0.018]]
                : [[660, 0.05, 0.05]]

      notes.forEach(([frequency, delay, duration], index) => {
        const oscillator = ctx.createOscillator()
        const gain = ctx.createGain()
        oscillator.type = 'sine'
        oscillator.frequency.value = frequency
        gain.gain.setValueAtTime(0, now + delay)
        gain.gain.linearRampToValueAtTime(0.045, now + delay + 0.008)
        gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + duration)
        oscillator.connect(gain).connect(ctx.destination)
        oscillator.start(now + delay + index * 0.001)
        oscillator.stop(now + delay + duration + 0.01)
      })
    } catch {
      // Audio is an enhancement; a blocked AudioContext must not break painting.
    }
  }
}
