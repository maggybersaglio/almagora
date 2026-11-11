/**
 * SpeechService - High-performance, zero-latency audio narration engine for Almagora
 * - Instant 0ms speech start
 * - Immediate interruption when re-clicked (no parallel overlapping voices)
 * - Strict session serialization (never plays multiple audios simultaneously)
 * - Automatic pre-warming of Italian voices on module load
 */

class SpeechService {
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private currentAudio: HTMLAudioElement | null = null;
  private currentPlaySession = 0; // Monotonic session ID to invalidate previous utterances

  private isSpeakingInternal = false;
  private isPausedInternal = false;

  private currentFullText = '';
  private currentSpeed = 1.0;
  private currentPersonaId = 'amico';

  private elapsedSeconds = 0;
  private estimatedDuration = 120;
  private progressInterval: any = null;

  private activeSinkId: string | null = null;
  private recognition: any = null;

  public onPlaybackEnd: (() => void) | null = null;
  public onPlaybackProgress: ((currentTime: number, duration: number) => void) | null = null;
  public onStateChange: ((isPlaying: boolean) => void) | null = null;

  constructor() {
    this.preWarmVoices();
  }

  // Pre-load voices in background so the very first speech starts without delay
  private preWarmVoices() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.getVoices();
        if (window.speechSynthesis.onvoiceschanged !== undefined) {
          window.speechSynthesis.onvoiceschanged = () => {
            window.speechSynthesis.getVoices();
          };
        }
      } catch (e) {
        console.warn('Voice pre-warm warning:', e);
      }
    }
  }

  public setAudioSinkId(sinkId: string) {
    this.activeSinkId = sinkId;
    if (this.currentAudio && 'setSinkId' in this.currentAudio) {
      try {
        (this.currentAudio as any).setSinkId(sinkId);
      } catch (e) {
        console.warn('Failed to setSinkId on audio element', e);
      }
    }
  }

  // Play proximity chime through headphones / speaker with stereo pan
  public playProximityChime() {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      if (this.activeSinkId && 'setSinkId' in ctx) {
        try {
          (ctx as any).setSinkId(this.activeSinkId);
        } catch {
          // fallback to default sink
        }
      }

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5
      osc.frequency.exponentialRampToValueAtTime(1174.66, ctx.currentTime + 0.35); // D6

      gain.gain.setValueAtTime(0.01, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.65);
    } catch (e) {
      console.warn('AudioContext chime not available', e);
    }
  }

  /**
   * Main entry for playing narration:
   * - Starts IMMEDIATELY in 0ms (no multi-second delay)
   * - Cancels any previous speech cleanly (zero overlap)
   * - Single-channel guarantee
   */
  public playNarration(
    text: string,
    options: {
      speed?: number;
      voicePersonaId?: string;
      onEnd?: () => void;
      onStart?: () => void;
      forceRestart?: boolean;
      /** Se presente, riproduce questa registrazione invece della voce sintetica */
      audioUrl?: string;
    } = {}
  ): boolean {
    if (!text || !text.trim()) return false;
    if (options.audioUrl) return this.playRecording(text.trim(), options.audioUrl, options);
    const cleanText = text.trim();

    // 1. Invalidate any in-flight playback sessions so old callbacks never execute
    const sessionId = ++this.currentPlaySession;

    // 2. Synchronously stop and cancel any previous speech synthesis
    this.stopPlaybackInternal();

    this.isSpeakingInternal = true;
    this.isPausedInternal = false;
    this.currentFullText = cleanText;

    const speed = options.speed || this.currentSpeed || 1.0;
    const persona = options.voicePersonaId || this.currentPersonaId || 'amico';
    this.currentSpeed = speed;
    this.currentPersonaId = persona;

    // Estimate duration based on Italian speech rate (~135 words per minute at 1.0x)
    const wordCount = cleanText.split(/\s+/).length;
    this.estimatedDuration = Math.max(15, Math.round(wordCount / (135 / 60) / speed));
    this.elapsedSeconds = 0;
    this.startProgressTimer();

    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      console.warn('speechSynthesis not supported in this environment');
      return false;
    }

    try {
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = 'it-IT';
      utterance.rate = speed;

      // Persona voice pitch tuning
      if (persona === 'professore') {
        utterance.pitch = 0.92;
      } else if (persona === 'famiglia') {
        utterance.pitch = 1.15;
      } else if (persona === 'narratore') {
        utterance.pitch = 0.98;
      } else {
        utterance.pitch = 1.0;
      }

      // Choose natural Italian voice
      const voices = window.speechSynthesis.getVoices();
      const italianVoice =
        voices.find(
          (v) =>
            v.lang.startsWith('it') &&
            (v.name.includes('Natural') ||
              v.name.includes('Google') ||
              v.name.includes('Alice') ||
              v.name.includes('Federica') ||
              v.name.includes('Elsa') ||
              v.name.includes('Cosimo') ||
              v.name.includes('Gianni'))
        ) || voices.find((v) => v.lang.startsWith('it'));

      if (italianVoice) {
        utterance.voice = italianVoice;
      }

      utterance.onstart = () => {
        if (this.currentPlaySession !== sessionId) return;
        this.isSpeakingInternal = true;
        this.isPausedInternal = false;
        options.onStart?.();
        this.onStateChange?.(true);
      };

      utterance.onend = () => {
        if (this.currentPlaySession !== sessionId) return;
        this.isSpeakingInternal = false;
        this.isPausedInternal = false;
        this.stopProgressTimer();
        this.elapsedSeconds = this.estimatedDuration;
        this.onPlaybackProgress?.(this.estimatedDuration, this.estimatedDuration);
        options.onEnd?.();
        this.onPlaybackEnd?.();
        this.onStateChange?.(false);
      };

      utterance.onerror = (e) => {
        if (this.currentPlaySession !== sessionId) return;
        if (e.error === 'canceled' || e.error === 'interrupted') return;
        console.warn('Speech synthesis error:', e);
        this.isSpeakingInternal = false;
        this.isPausedInternal = false;
        this.stopProgressTimer();
        options.onEnd?.();
        this.onPlaybackEnd?.();
        this.onStateChange?.(false);
      };

      this.currentUtterance = utterance;

      // Cancel any buffered queue and immediately speak
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);

      options.onStart?.();
      this.onStateChange?.(true);
      return true;
    } catch (err) {
      console.warn('Speech invocation error:', err);
      this.isSpeakingInternal = false;
      this.stopProgressTimer();
      this.onStateChange?.(false);
      return false;
    }
  }

  /**
   * Plays a real recorded voice file. If the file cannot be played,
   * falls back to speech synthesis of the same text.
   */
  private playRecording(
    text: string,
    url: string,
    options: { speed?: number; voicePersonaId?: string; onEnd?: () => void; onStart?: () => void }
  ): boolean {
    const sessionId = ++this.currentPlaySession;
    this.stopPlaybackInternal();

    const speed = options.speed || this.currentSpeed || 1.0;
    this.currentSpeed = speed;
    this.currentFullText = text;
    this.isSpeakingInternal = true;
    this.isPausedInternal = false;
    this.elapsedSeconds = 0;

    const audio = new Audio(url);
    audio.playbackRate = speed;
    if (this.activeSinkId && 'setSinkId' in audio) {
      try {
        (audio as any).setSinkId(this.activeSinkId);
      } catch {}
    }
    this.currentAudio = audio;

    const fallbackToSynthesis = () => {
      if (this.currentPlaySession !== sessionId) return;
      console.warn('Recorded audio unavailable, using speech synthesis:', url);
      this.currentAudio = null;
      this.playNarration(text, { ...options });
    };

    audio.onloadedmetadata = () => {
      if (this.currentPlaySession !== sessionId) return;
      this.estimatedDuration = Math.max(1, audio.duration / speed);
    };
    audio.ontimeupdate = () => {
      if (this.currentPlaySession !== sessionId) return;
      this.elapsedSeconds = audio.currentTime;
      this.onPlaybackProgress?.(audio.currentTime, audio.duration || this.estimatedDuration);
    };
    audio.onended = () => {
      if (this.currentPlaySession !== sessionId) return;
      this.isSpeakingInternal = false;
      this.currentAudio = null;
      options.onEnd?.();
      this.onPlaybackEnd?.();
      this.onStateChange?.(false);
    };
    audio.onerror = fallbackToSynthesis;

    audio
      .play()
      .then(() => {
        if (this.currentPlaySession !== sessionId) return;
        options.onStart?.();
        this.onStateChange?.(true);
      })
      .catch(fallbackToSynthesis);
    return true;
  }

  /**
   * Toggle Play / Stop cleanly:
   * - If already playing: INTERRUPTS immediately (stops all audio, zero residual sound)
   * - If stopped: starts audio once immediately with 0ms latency
   * - NEVER plays multiple audio streams simultaneously
   */
  public togglePlay(
    text: string,
    options: {
      speed?: number;
      voicePersonaId?: string;
      onEnd?: () => void;
      onStart?: () => void;
    } = {}
  ): boolean {
    if (this.isPlaying()) {
      // Audio is already active -> INTERRUPT immediately
      this.stop();
      return false;
    } else {
      // Audio is not active -> PLAY once immediately
      this.playNarration(text, options);
      return true;
    }
  }

  public pause() {
    this.stop();
  }

  public resume() {
    if (this.currentFullText) {
      this.playNarration(this.currentFullText, {
        speed: this.currentSpeed,
        voicePersonaId: this.currentPersonaId,
      });
    }
  }

  /**
   * Stops playback immediately, resets utterance, cancels browser synthesis
   */
  public stop() {
    this.currentPlaySession++; // Immediately invalidates any active callbacks
    this.stopPlaybackInternal();
    this.onStateChange?.(false);
  }

  private stopPlaybackInternal() {
    this.stopProgressTimer();
    this.isSpeakingInternal = false;
    this.isPausedInternal = false;

    if (this.currentUtterance) {
      this.currentUtterance.onstart = null;
      this.currentUtterance.onend = null;
      this.currentUtterance.onerror = null;
      this.currentUtterance = null;
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
      } catch {}
      this.currentAudio = null;
    }
  }

  public isPlaying(): boolean {
    const synthSpeaking =
      typeof window !== 'undefined' &&
      'speechSynthesis' in window &&
      (window.speechSynthesis.speaking || window.speechSynthesis.pending);
    return this.isSpeakingInternal || Boolean(synthSpeaking);
  }

  public isPaused(): boolean {
    return this.isPausedInternal;
  }

  public skipSeconds(delta: number) {
    if (this.currentAudio) {
      const dur = this.currentAudio.duration || this.estimatedDuration;
      this.currentAudio.currentTime = Math.max(0, Math.min(dur, this.currentAudio.currentTime + delta));
      return;
    }
    const newTime = Math.max(0, Math.min(this.estimatedDuration, this.elapsedSeconds + delta));
    this.elapsedSeconds = newTime;
    if (this.onPlaybackProgress) {
      this.onPlaybackProgress(this.elapsedSeconds, this.estimatedDuration);
    }
  }

  public getProgress(): { current: number; duration: number } {
    return {
      current: this.elapsedSeconds,
      duration: this.estimatedDuration,
    };
  }

  public setSpeed(speed: number) {
    this.currentSpeed = speed;
    if (this.currentUtterance) {
      this.currentUtterance.rate = speed;
    }
  }

  private startProgressTimer() {
    this.stopProgressTimer();
    this.progressInterval = setInterval(() => {
      if (this.isSpeakingInternal) {
        this.elapsedSeconds += 0.5;
        if (this.elapsedSeconds >= this.estimatedDuration) {
          this.elapsedSeconds = this.estimatedDuration;
        }
        if (this.onPlaybackProgress) {
          this.onPlaybackProgress(this.elapsedSeconds, this.estimatedDuration);
        }
      }
    }, 500);
  }

  private stopProgressTimer() {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
  }

  // Voice recognition via Bluetooth headset mic or device mic
  public async startListening(
    onResult: (text: string) => void,
    onError?: (error: string) => void,
    onEnd?: () => void,
    onInterim?: (interimText: string) => void
  ): Promise<boolean> {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      onError?.('BrowserSpeechRecognitionNotSupported');
      return false;
    }

    try {
      if (this.recognition) {
        try {
          this.recognition.abort();
        } catch {}
      }

      // Proactively test/request microphone permission so Chrome doesn't silently reject
      if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach((track) => track.stop());
        } catch (permErr: any) {
          console.warn('Microphone permission check warning:', permErr);
          if (permErr.name === 'NotAllowedError' || permErr.name === 'PermissionDeniedError') {
            onError?.('not-allowed');
            return false;
          }
        }
      }

      const rec = new SpeechRecognition();
      rec.lang = 'it-IT';
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      rec.continuous = false;

      let hasDeliveredFinal = false;

      rec.onresult = (event: any) => {
        let interimText = '';
        let finalText = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const item = event.results[i];
          const transcript = item[0]?.transcript || '';
          if (item.isFinal) {
            finalText += transcript;
          } else {
            interimText += transcript;
          }
        }

        if (interimText && onInterim) {
          onInterim(interimText);
        }

        if (finalText && !hasDeliveredFinal) {
          hasDeliveredFinal = true;
          onResult(finalText.trim());
        }
      };

      rec.onerror = (e: any) => {
        onError?.(e.error || 'Errore microfono');
      };

      rec.onend = () => {
        onEnd?.();
        this.recognition = null;
      };

      rec.start();
      this.recognition = rec;
      return true;
    } catch (err: any) {
      onError?.(err.message || 'Errore avvio microfono');
      return false;
    }
  }

  public stopListening() {
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {}
      this.recognition = null;
    }
  }
}

export const speechService = new SpeechService();
