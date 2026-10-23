'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUp, Mic, X, Square } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/cn';
import { api } from '@/lib/api';
import { toFaDigits } from '@/lib/domain/format';
import { VoiceWave } from './VoiceWave';

type SpeechRec = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: unknown) => void) | null;
  onend: (() => void) | null;
};

let sttHealth: boolean | null = null;

export function PromptPill({
  onSend,
  disabled,
  placeholder = 'بگو چی میخوای بخری…',
  autoFocus,
  className,
}: {
  onSend: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const [text, setText] = useState('');
  const [rec, setRec] = useState<'idle' | 'recording' | 'transcribing'>('idle');
  const [secs, setSecs] = useState(0);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const cancelled = useRef(false);
  const speechRef = useRef<SpeechRec | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoSend = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasText = text.trim().length > 0;

  const clearAuto = () => {
    if (autoSend.current) clearTimeout(autoSend.current);
    autoSend.current = null;
    setCountdown(null);
  };

  const submit = useCallback(() => {
    clearAuto();
    const t = text.trim();
    if (!t || disabled) return;
    onSend(t);
    setText('');
  }, [text, disabled, onSend]);

  // auto-grow textarea
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = '0px';
    ta.style.height = `${Math.min(ta.scrollHeight, 132)}px`;
  }, [text]);

  useEffect(() => () => stopTracks(), []); // eslint-disable-line react-hooks/exhaustive-deps

  function stopTracks() {
    if (timer.current) clearInterval(timer.current);
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
  }

  function fillTranscript(t: string) {
    const v = t.trim();
    if (!v) {
      toast('صدایی شنیده نشد؛ دوباره امتحان کن یا تایپ کن.');
      return;
    }
    setText(v);
    setCountdown(1.5);
    // auto-send after 1.5 s unless the user touches the input
    autoSend.current = setTimeout(() => {
      autoSend.current = null;
      setCountdown(null);
      onSend(v);
      setText('');
    }, 1500);
  }

  function browserSpeech(): boolean {
    const W = window as unknown as { webkitSpeechRecognition?: new () => SpeechRec; SpeechRecognition?: new () => SpeechRec };
    const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!Ctor) return false;
    const r = new Ctor();
    r.lang = 'fa-IR';
    r.interimResults = false;
    r.continuous = false;
    r.onresult = (e) => fillTranscript(Array.from(e.results).map((x) => x[0].transcript).join(' '));
    r.onerror = () => toast('تشخیص گفتار انجام نشد؛ لطفاً تایپ کن.');
    r.onend = () => setRec('idle');
    speechRef.current = r;
    setRec('recording');
    setSecs(0);
    timer.current = setInterval(() => setSecs((s) => s + 1), 1000);
    r.start();
    return true;
  }

  async function startRecording() {
    clearAuto();
    if (sttHealth === null) {
      sttHealth = await api
        .health()
        .then((h) => h.stt)
        .catch(() => false);
    }
    if (!sttHealth) {
      if (!browserSpeech()) toast('ورودی صوتی الان در دسترس نیست؛ لطفاً تایپ کن.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      if (!browserSpeech()) toast('مرورگر شما ضبط صدا را پشتیبانی نمی‌کند؛ لطفاً تایپ کن.');
      return;
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
      const mr = new MediaRecorder(s, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      cancelled.current = false;
      mr.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      mr.onstop = async () => {
        s.getTracks().forEach((t) => t.stop());
        setStream(null);
        if (timer.current) clearInterval(timer.current);
        if (cancelled.current) {
          setRec('idle');
          return;
        }
        const type = mr.mimeType || mime || 'audio/webm';
        const blob = new Blob(chunks.current, { type });
        setRec('transcribing');
        try {
          fillTranscript(await api.transcribe(blob, type));
        } catch {
          sttHealth = false;
          toast('تبدیل صدا به متن انجام نشد؛ لطفاً تایپ کن.');
        } finally {
          setRec('idle');
          taRef.current?.focus();
        }
      };
      mediaRef.current = mr;
      setStream(s);
      mr.start(250);
      setRec('recording');
      setSecs(0);
      timer.current = setInterval(
        () =>
          setSecs((v) => {
            if (v + 1 >= 60 && mr.state === 'recording') mr.stop();
            return v + 1;
          }),
        1000,
      );
    } catch {
      toast('اجازه‌ی میکروفون داده نشد؛ می‌تونی تایپ کنی.');
      setRec('idle');
    }
  }

  function stopRecording(cancel = false) {
    cancelled.current = cancel;
    if (speechRef.current) {
      if (cancel) speechRef.current.abort();
      else speechRef.current.stop();
      speechRef.current = null;
      if (timer.current) clearInterval(timer.current);
      if (cancel) setRec('idle');
      return;
    }
    const mr = mediaRef.current;
    if (mr && mr.state === 'recording') mr.stop();
    else setRec('idle');
  }

  const recording = rec === 'recording';
  const mm = `${toFaDigits(Math.floor(secs / 60))}:${toFaDigits(String(secs % 60).padStart(2, '0'))}`;

  return (
    <div className={cn('w-full', className)}>
      <div
        className={cn(
          'relative flex min-h-[64px] items-end gap-2 rounded-[32px] border border-line bg-surface p-2 ps-5 shadow-[0_1px_2px_rgb(16_24_40/0.04)] transition-[box-shadow,border-color] focus-within:border-line-strong focus-within:shadow-soft',
          recording && 'border-accent-soft bg-accent-wash/40',
        )}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {recording ? (
            <motion.div
              key="wave"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="flex h-12 min-w-0 flex-1 items-center gap-3"
            >
              <button
                onClick={() => stopRecording(true)}
                className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2"
                aria-label="لغو ضبط"
              >
                <X className="size-5" />
              </button>
              <VoiceWave stream={stream} className="h-8 min-w-0 flex-1" />
              <span className="ltr-nums shrink-0 text-sm tabular-nums text-ink-2" aria-live="polite">
                {mm}
              </span>
            </motion.div>
          ) : (
            <motion.textarea
              key="ta"
              ref={taRef}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              rows={1}
              value={text}
              autoFocus={autoFocus}
              disabled={rec === 'transcribing'}
              onChange={(e) => {
                clearAuto();
                setText(e.target.value);
              }}
              onFocus={clearAuto}
              onPointerDown={clearAuto}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder={rec === 'transcribing' ? 'در حال تبدیل صدا به متن…' : placeholder}
              aria-label="پیام"
              className="max-h-[132px] min-h-12 min-w-0 flex-1 resize-none bg-transparent py-3 text-[16px] leading-6 text-ink outline-none placeholder:text-faint"
              data-testid="prompt-input"
            />
          )}
        </AnimatePresence>
        <button
          onClick={() => (recording ? stopRecording(false) : hasText ? submit() : startRecording())}
          disabled={disabled || rec === 'transcribing'}
          aria-label={recording ? 'پایان ضبط' : hasText ? 'ارسال' : 'گفتن با صدا'}
          className={cn(
            'relative flex size-12 shrink-0 items-center justify-center rounded-full text-white transition-colors focus-visible:outline-offset-4',
            disabled ? 'bg-accent-soft' : 'bg-accent hover:bg-accent-strong',
          )}
          data-testid="prompt-action"
        >
          {recording && <span className="absolute inset-0 animate-ping rounded-full bg-accent/40" />}
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={recording ? 'stop' : hasText ? 'send' : 'mic'}
              initial={{ scale: 0.4, opacity: 0, rotate: -45 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              exit={{ scale: 0.4, opacity: 0, rotate: 45 }}
              transition={{ duration: 0.15 }}
              className="relative"
            >
              {recording ? <Square className="size-4 fill-white" /> : hasText ? <ArrowUp className="size-5" strokeWidth={2.5} /> : <Mic className="size-5" />}
            </motion.span>
          </AnimatePresence>
          {countdown !== null && (
            <svg className="absolute inset-0 -rotate-90" viewBox="0 0 48 48" aria-hidden>
              <circle cx="24" cy="24" r="22" fill="none" stroke="white" strokeOpacity="0.9" strokeWidth="2" strokeDasharray="138" className="animate-[countdown_1.5s_linear_forwards]" />
            </svg>
          )}
        </button>
      </div>
      {countdown !== null && <p className="mt-1.5 text-center text-xs text-muted">ارسال خودکار… برای ویرایش روی متن بزن</p>}
    </div>
  );
}
