import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  MicOff,
  Send,
  X,
  Volume2,
  VolumeX,
  Sparkles,
  Headphones,
  Bot,
  Trash2,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { askCiceroneQuestion, transcribeAudioBlob, CiceroneAiError } from '../services/ciceroneApi';
import { speechService } from '../services/speechService';
import { BluetoothDeviceState, VoicePersonaId } from '../types/tour';

interface Message {
  id: string;
  sender: 'user' | 'cicerone';
  text: string;
  timestamp: string;
  isError?: boolean;
}

interface VoiceAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentMonumentName: string;
  city: string;
  voicePersona: VoicePersonaId;
  bluetoothState: BluetoothDeviceState;
  suggestedQuestions?: string[];
  userLocation?: { lat: number; lng: number } | null;
}

const STORAGE_KEY = 'almagora_cicerone_chat_messages';

export const VoiceAssistantModal: React.FC<VoiceAssistantModalProps> = ({
  isOpen,
  onClose,
  currentMonumentName,
  city,
  voicePersona,
  bluetoothState,
  suggestedQuestions = [],
  userLocation = null,
}) => {
  // 1. Persistent chat history (survives closes, tab switches, and audio events)
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {}
    return [
      {
        id: 'init',
        sender: 'cicerone',
        text: `Ti ascolto nelle cuffie! Sono qui accanto a te davanti a ${
          currentMonumentName || 'questo luogo'
        }. Chiedimi qualsiasi curiosità storica, architettonica o un consiglio su dove fare una pausa nei dintorni.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ];
  });

  const [inputQuery, setInputQuery] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [micVolumeLevel, setMicVolumeLevel] = useState(0);
  const [currentlyPlayingMessageId, setCurrentlyPlayingMessageId] = useState<string | null>(null);

  const chatBottomRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const isSpeechRecActiveRef = useRef(false);

  // Sync messages to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {}
  }, [messages]);

  // Keep track of audio playback state from speechService
  useEffect(() => {
    const unsub = (playing: boolean) => {
      if (!playing) {
        setCurrentlyPlayingMessageId(null);
      }
    };
    speechService.onStateChange = unsub;
    return () => {
      if (speechService.onStateChange === unsub) {
        speechService.onStateChange = null;
      }
    };
  }, []);

  // Scroll to bottom on new messages or loading
  useEffect(() => {
    if (isOpen && chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading, isOpen, liveTranscript]);

  // Clean up audio streams if modal unmounts
  useEffect(() => {
    return () => {
      stopAllRecording();
    };
  }, []);

  if (!isOpen) return null;

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputQuery).trim();
    if (!text || isLoading) return;

    setInputQuery('');
    setLiveTranscript('');
    setMicError(null);

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    // Conversation so far (errors and the static greeting are not part of the real dialogue)
    const history = messages
      .filter((m) => !m.isError && !m.id.startsWith('init'))
      .map((m) => ({ sender: m.sender, text: m.text }));

    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const response = await askCiceroneQuestion({
        question: text,
        currentMonument: currentMonumentName,
        city,
        voicePersona,
        conversationHistory: history,
        userLocation,
      });

      const botMsgId = `c-${Date.now()}`;
      const botMsg: Message = {
        id: botMsgId,
        sender: 'cicerone',
        text: response.answer,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, botMsg]);
      setCurrentlyPlayingMessageId(botMsgId);

      // Speak back through Bluetooth earphones / speaker!
      speechService.playNarration(response.answer, {
        voicePersonaId: voicePersona,
        onStart: () => setCurrentlyPlayingMessageId(botMsgId),
        onEnd: () => setCurrentlyPlayingMessageId(null),
      });
    } catch (err) {
      console.error('Error in askCiceroneQuestion:', err);
      setMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          sender: 'cicerone',
          isError: true,
          text:
            err instanceof CiceroneAiError
              ? err.message
              : 'Si è verificato un errore imprevisto. Riprova.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const stopAllRecording = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((track) => track.stop());
      audioStreamRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
      mediaRecorderRef.current = null;
    }
    speechService.stopListening();
    isSpeechRecActiveRef.current = false;
    setIsListening(false);
    setMicVolumeLevel(0);
  };

  // Start microphone capture with live visual waveform and dual-engine transcription
  const handleStartVoiceRecord = async () => {
    setMicError(null);
    setLiveTranscript('');
    stopAllRecording();

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setMicError('Il tuo browser non supporta la registrazione microfono.');
        return;
      }

      // Request live microphone stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      audioStreamRef.current = stream;
      setIsListening(true);

      // Setup audio analyzer for live voice level animation
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 64;
          source.connect(analyser);

          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          const checkVolume = () => {
            if (!audioStreamRef.current) return;
            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
              sum += dataArray[i];
            }
            const avg = sum / dataArray.length;
            setMicVolumeLevel(Math.min(100, Math.round((avg / 128) * 100)));
            animFrameRef.current = requestAnimationFrame(checkVolume);
          };
          checkVolume();
        }
      } catch (e) {
        console.warn('AudioContext analyzer warning:', e);
      }

      // Prepare MediaRecorder as backup transcription engine
      audioChunksRef.current = [];
      let mimeType = 'audio/webm';
      if (!MediaRecorder.isTypeSupported('audio/webm')) {
        if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
          mimeType = 'audio/ogg';
        } else {
          mimeType = '';
        }
      }

      try {
        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };
        recorder.start(250);
        mediaRecorderRef.current = recorder;
      } catch (recErr) {
        console.warn('MediaRecorder init warning:', recErr);
      }

      // Attempt native SpeechRecognition for instant zero-latency speech-to-text
      let receivedFinalTranscript = false;
      const started = await speechService.startListening(
        (transcript) => {
          // Native SpeechRecognition delivered final transcript
          receivedFinalTranscript = true;
          setLiveTranscript(transcript);
          stopAllRecording();
          handleSendMessage(transcript);
        },
        async (errCode) => {
          console.warn('Native speech recognition notice/fallback:', errCode);
          if (errCode === 'not-allowed') {
            setMicError('Accesso al microfono bloccato. Concedi il permesso nel browser.');
            stopAllRecording();
            return;
          }

          // If speech recognition fails (or no speech recognized natively),
          // fallback to Gemini Multimodal Audio transcription using the recorded audio blob!
          if (!receivedFinalTranscript && audioChunksRef.current.length > 0) {
            try {
              const recordedBlob = new Blob(audioChunksRef.current, { type: mimeType || 'audio/webm' });
              if (recordedBlob.size > 1000) {
                setIsLoading(true);
                const geminiTranscript = await transcribeAudioBlob(recordedBlob);
                if (geminiTranscript && geminiTranscript.trim()) {
                  setLiveTranscript(geminiTranscript);
                  handleSendMessage(geminiTranscript);
                }
              }
            } catch (fallbackErr) {
              console.warn('Fallback transcription error:', fallbackErr);
            } finally {
              setIsLoading(false);
            }
          }
        },
        () => {
          // onEnd
          isSpeechRecActiveRef.current = false;
        },
        (interim) => {
          setLiveTranscript(interim);
        }
      );

      isSpeechRecActiveRef.current = started;
    } catch (err: any) {
      console.error('Microphone access error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setMicError('Accesso al microfono negato. Consenti il microfono dalle impostazioni per parlare.');
      } else {
        setMicError('Impossibile accedere al microfono del dispositivo.');
      }
      stopAllRecording();
    }
  };

  const handleStopVoiceRecordAndSend = async () => {
    if (!isListening) return;

    // If we have live transcript from native speech recognition, send it immediately
    if (liveTranscript.trim()) {
      const text = liveTranscript.trim();
      stopAllRecording();
      handleSendMessage(text);
      return;
    }

    // Otherwise finalize MediaRecorder and send to Gemini audio transcription
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        setIsLoading(true);
        mediaRecorderRef.current.requestData();
        await new Promise((resolve) => setTimeout(resolve, 300));
        stopAllRecording();

        if (audioChunksRef.current.length > 0) {
          const recordedBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const transcript = await transcribeAudioBlob(recordedBlob);
          if (transcript && transcript.trim()) {
            handleSendMessage(transcript);
          } else {
            setMicError('Nessuna voce rilevata chiaramente. Prova di nuovo a parlare.');
          }
        }
      } catch (err) {
        console.warn('Transcription error:', err);
        setMicError('Non sono riuscito a comprendere l’audio. Riprova o scrivi.');
      } finally {
        setIsLoading(false);
      }
    } else {
      stopAllRecording();
    }
  };

  const handleClearChatHistory = () => {
    const initialMsg: Message = {
      id: `init-${Date.now()}`,
      sender: 'cicerone',
      text: `Ti ascolto nelle cuffie! Sono qui accanto a te davanti a ${
        currentMonumentName || 'questo luogo'
      }. Chiedimi qualsiasi curiosità storica, architettonica o un consiglio su dove fare una pausa nei dintorni.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages([initialMsg]);
    speechService.stop();
    setCurrentlyPlayingMessageId(null);
  };

  const handleReplayVoice = (msgId: string, text: string) => {
    if (currentlyPlayingMessageId === msgId && speechService.isPlaying()) {
      speechService.stop();
      setCurrentlyPlayingMessageId(null);
    } else {
      setCurrentlyPlayingMessageId(msgId);
      speechService.playNarration(text, {
        voicePersonaId: voicePersona,
        onStart: () => setCurrentlyPlayingMessageId(msgId),
        onEnd: () => setCurrentlyPlayingMessageId(null),
      });
    }
  };

  const defaultSuggestions =
    suggestedQuestions.length > 0
      ? suggestedQuestions
      : [
          `Chi ha commissionato ${currentMonumentName || 'questo monumento'}?`,
          'C’è una fontanella d’acqua potabile o un bar qui vicino?',
          'Qual è la leggenda o il mistero più strano di questo luogo?',
          'Consigliami uno scorcio fotografico imperdibile nei dintorni',
        ];

  return (
    <div
      onClick={(e) => {
        // Only close if clicking directly on the backdrop, not inside modal
        if (e.target === e.currentTarget) {
          stopAllRecording();
          onClose();
        }
      }}
      className="fixed inset-0 z-[70] bg-stone-950/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[#0c141d] border border-[#1e5e7f]/40 rounded-t-3xl sm:rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[#1e5e7f]/30 flex items-center justify-between bg-[#121c27]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#1e5e7f]/30 text-[#79c3e6] border border-[#1e5e7f]/50 flex items-center justify-center shrink-0">
              <Bot className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-stone-100 flex items-center gap-1.5 truncate">
                <span>Almagora in Cuffia</span>
                {bluetoothState.connected && (
                  <span className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-950/50 px-1.5 py-0.5 rounded border border-emerald-800/40 font-mono shrink-0">
                    <Headphones className="w-3 h-3" />
                    <span className="truncate max-w-[100px]">{bluetoothState.deviceName || 'Cuffie'}</span>
                  </span>
                )}
              </div>
              <div className="text-[11px] text-[#79c3e6] truncate">
                Tappa: {currentMonumentName || city}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={handleClearChatHistory}
              title="Azzera conversazione"
              className="p-2 text-stone-400 hover:text-red-400 rounded-lg hover:bg-stone-800/60 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                stopAllRecording();
                onClose();
              }}
              title="Riduci / Chiudi"
              className="p-2 text-stone-400 hover:text-stone-100 rounded-lg hover:bg-stone-800/60 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Microphone Permission or Connection Warning banner */}
        {micError && (
          <div className="px-4 py-2 bg-amber-950/60 border-b border-amber-800/50 text-amber-200 text-xs flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
              <span>{micError}</span>
            </div>
            <button
              type="button"
              onClick={() => setMicError(null)}
              className="text-amber-400 hover:text-white text-xs underline shrink-0"
            >
              Chiudi
            </button>
          </div>
        )}

        {/* Chat message history (preserved permanently) */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5 min-h-[260px] max-h-[380px] bg-[#080d14]/80">
          {messages.map((msg) => {
            const isPlayingThis = currentlyPlayingMessageId === msg.id && speechService.isPlaying();
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${
                  msg.sender === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <div
                  className={`max-w-[88%] rounded-2xl px-4 py-3 text-xs sm:text-sm leading-relaxed ${
                    msg.sender === 'user'
                      ? 'bg-[#1e5e7f] text-white font-medium rounded-br-none shadow-md'
                      : msg.isError
                      ? 'bg-red-950/50 border border-red-800/50 text-red-200 rounded-bl-none'
                      : 'bg-[#121c27] border border-[#1e5e7f]/30 text-stone-200 rounded-bl-none shadow-sm space-y-2'
                  }`}
                >
                  <div>{msg.text}</div>

                  {/* Audio Controls Badge on AI answers */}
                  {msg.sender === 'cicerone' && !msg.isError && (
                    <div className="pt-1.5 border-t border-stone-800 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => handleReplayVoice(msg.id, msg.text)}
                        className={`flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-colors ${
                          isPlayingThis
                            ? 'bg-[#1e5e7f] text-white animate-pulse'
                            : 'bg-[#080d14] text-[#79c3e6] hover:bg-[#1e5e7f]/30'
                        }`}
                      >
                        {isPlayingThis ? (
                          <>
                            <VolumeX className="w-3.5 h-3.5" />
                            <span>Ferma voce in cuffia</span>
                          </>
                        ) : (
                          <>
                            <Volume2 className="w-3.5 h-3.5" />
                            <span>Riascolta in cuffia</span>
                          </>
                        )}
                      </button>

                      {isPlayingThis && (
                        <div className="flex items-center gap-0.5">
                          <span className="w-1 h-3 bg-[#79c3e6] rounded-full animate-bounce"></span>
                          <span className="w-1 h-4 bg-[#79c3e6] rounded-full animate-bounce [animation-delay:150ms]"></span>
                          <span className="w-1 h-2 bg-[#79c3e6] rounded-full animate-bounce [animation-delay:300ms]"></span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <span className="text-[10px] text-stone-500 mt-1 px-1">
                  {msg.timestamp}
                </span>
              </div>
            );
          })}

          {/* AI thinking state indicator */}
          {isLoading && (
            <div className="flex items-center gap-2.5 text-xs text-[#79c3e6] bg-[#121c27] p-3 rounded-2xl border border-[#1e5e7f]/40 w-fit">
              <Loader2 className="w-4 h-4 animate-spin text-[#79c3e6]" />
              <span>Almagora sta formulando la risposta per le tue cuffie...</span>
            </div>
          )}

          <div ref={chatBottomRef} />
        </div>

        {/* Live Active Voice Listening Overlay Banner */}
        {isListening && (
          <div className="p-3 bg-[#102334] border-t border-[#1e5e7f]/50 flex flex-col gap-2 animate-in fade-in">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-red-500 animate-ping"></span>
                <span className="text-xs font-bold text-white">
                  Almagora ti ascolta in cuffia...
                </span>
              </div>

              {/* Animated Live Voice Equalizer Bars */}
              <div className="flex items-center gap-1 h-4">
                {[...Array(8)].map((_, i) => (
                  <span
                    key={i}
                    className="w-1 bg-[#79c3e6] rounded-full transition-all duration-75"
                    style={{
                      height: `${Math.max(4, Math.round((micVolumeLevel * ((i % 3) + 1)) / 10))}px`,
                    }}
                  />
                ))}
              </div>
            </div>

            {liveTranscript ? (
              <div className="text-xs text-stone-200 font-mono bg-[#080d14] p-2 rounded-lg border border-[#1e5e7f]/40">
                "{liveTranscript}"
              </div>
            ) : (
              <div className="text-[11px] text-stone-400 italic">
                Parla liberamente davanti al monumento o chiedi un consiglio...
              </div>
            )}

            <div className="flex items-center gap-2 justify-end">
              <button
                type="button"
                onClick={stopAllRecording}
                className="px-3 py-1 bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs rounded-lg transition-colors"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={handleStopVoiceRecordAndSend}
                className="px-4 py-1.5 bg-[#1e5e7f] hover:bg-[#287096] text-white text-xs font-bold rounded-lg shadow transition-colors flex items-center gap-1.5"
              >
                <span>Fatto / Invia</span>
                <Send className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}

        {/* Suggested Quick Questions */}
        {!isListening && (
          <div className="px-4 py-2 border-t border-stone-800/80 bg-[#0c141d]">
            <div className="text-[11px] font-semibold text-stone-400 mb-1.5 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-[#79c3e6]" />
              <span>Domande rapide suggerite:</span>
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {defaultSuggestions.map((q, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSendMessage(q)}
                  className="whitespace-nowrap px-3 py-1 bg-[#121c27] hover:bg-[#1a293a] text-stone-300 hover:text-white text-xs rounded-lg border border-[#1e5e7f]/30 transition-colors shrink-0"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Voice Input & Text Input Bar */}
        <div className="p-4 border-t border-stone-800 bg-[#0a1118] flex items-center gap-2.5">
          {/* Main Earphone Voice Button */}
          <button
            type="button"
            onClick={isListening ? handleStopVoiceRecordAndSend : handleStartVoiceRecord}
            className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-transform active:scale-95 shadow-xl ${
              isListening
                ? 'bg-red-500 text-white animate-pulse'
                : 'bg-[#1e5e7f] hover:bg-[#287096] text-white'
            }`}
            title={isListening ? 'Termina ascolto e invia' : 'Premi per parlare con Almagora in cuffia'}
          >
            {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex-1 flex items-center gap-2"
          >
            <input
              type="text"
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              placeholder={isListening ? 'Parla adesso...' : 'Fai una domanda ad Almagora...'}
              disabled={isListening || isLoading}
              className="flex-1 bg-[#080d14] border border-[#1e5e7f]/40 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-stone-100 placeholder:text-stone-500 focus:outline-none focus:border-[#389ac3]"
            />
            <button
              type="submit"
              disabled={!inputQuery.trim() || isLoading}
              className="w-10 h-10 rounded-xl bg-[#1e5e7f] hover:bg-[#287096] text-white disabled:opacity-40 flex items-center justify-center transition-colors shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
