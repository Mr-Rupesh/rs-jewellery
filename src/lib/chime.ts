type AudioCtor = typeof AudioContext;
let ctx: AudioContext | null = null;

/** Must be called from a click: browsers block sound until the user interacts. */
export function enableAlerts(): void {
  const Ctor: AudioCtor | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
  if (Ctor) { ctx ??= new Ctor(); void ctx.resume(); }
  if ("Notification" in window && Notification.permission === "default") void Notification.requestPermission();
}

export function playChime(): void {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  [[880, 0], [1174.66, 0.18]].forEach(([freq, delay]) => {
    const osc = ctx!.createOscillator(), gain = ctx!.createGain();
    osc.type = "sine"; osc.frequency.value = freq!;
    gain.gain.setValueAtTime(0.0001, t0 + delay!);
    gain.gain.exponentialRampToValueAtTime(0.25, t0 + delay! + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + delay! + 0.6);
    osc.connect(gain).connect(ctx!.destination);
    osc.start(t0 + delay!); osc.stop(t0 + delay! + 0.65);
  });
}

export function notify(title: string, body: string): void {
  if ("Notification" in window && Notification.permission === "granted") new Notification(title, { body });
}
