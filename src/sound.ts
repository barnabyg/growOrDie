/** Optional short cues, synthesized locally. No autoplay, media downloads or
 * preference-storage access can interfere with saving a run. */
export class GameSound {
  enabled = false;
  private context: AudioContext | undefined;
  private readonly playing = new Set<OscillatorNode>();

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      for (const oscillator of this.playing) oscillator.stop();
    }
  }

  async play(
    cue: "harvest" | "growth" | "famine" | "milestone",
  ): Promise<void> {
    if (!this.enabled) return;
    try {
      this.context ??= new AudioContext();
      const context = this.context;
      await context.resume();
      if (!this.enabled) return;
      const notes = {
        harvest: [330, 440],
        growth: [440, 554],
        famine: [220, 165],
        milestone: [440, 554, 659, 880],
      };
      notes[cue].forEach((frequency, index) => {
        const start = context.currentTime + index * 0.12;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.035, start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.17);
        oscillator.connect(gain);
        gain.connect(context.destination);
        this.playing.add(oscillator);
        oscillator.onended = () => {
          this.playing.delete(oscillator);
          oscillator.disconnect();
          gain.disconnect();
        };
        oscillator.start(start);
        oscillator.stop(start + 0.18);
      });
    } catch {
      // Unsupported or blocked audio leaves all game actions available.
    }
  }
}
