'use client';
import { useEffect, useRef } from 'react';

/** Live waveform from an AnalyserNode (falls back to a gentle idle wave). */
export function VoiceWave({ stream, className }: { stream: MediaStream | null; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    let analyser: AnalyserNode | null = null;
    let audioCtx: AudioContext | null = null;
    if (stream) {
      try {
        audioCtx = new AudioContext();
        const src = audioCtx.createMediaStreamSource(stream);
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        src.connect(analyser);
      } catch {
        analyser = null;
      }
    }
    const data = new Uint8Array(analyser?.frequencyBinCount ?? 128);
    const bars = 36;
    const draw = (t: number) => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (analyser) analyser.getByteFrequencyData(data);
      const color = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#f04f78';
      ctx.fillStyle = color;
      const gap = 3;
      const bw = Math.max(2, (w - gap * (bars - 1)) / bars);
      for (let i = 0; i < bars; i++) {
        const v = analyser ? data[Math.floor((i / bars) * data.length * 0.7)] / 255 : 0.15 + 0.1 * Math.sin(t / 220 + i / 2);
        const bh = Math.max(3, v * h);
        const x = i * (bw + gap);
        ctx.globalAlpha = 0.45 + v * 0.55;
        ctx.beginPath();
        ctx.roundRect(x, (h - bh) / 2, bw, bh, bw / 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      void audioCtx?.close();
    };
  }, [stream]);
  return <canvas ref={ref} className={className} aria-hidden />;
}
