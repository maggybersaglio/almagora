import React, { useState } from 'react';
import { MonumentNarration, Waypoint, VoicePersona, VoicePersonaId } from '../types/tour';
import { VOICE_PERSONAS } from '../data/mockTours';
import { getRecordedAudio } from '../data/recordedAudio';
import {
  Play,
  Pause,
  RotateCcw,
  FastForward,
  ChevronUp,
  ChevronDown,
  Volume2,
  Sparkles,
  Compass,
  HelpCircle,
  Mic,
  CheckCircle2,
  Bookmark,
  Share2,
} from 'lucide-react';

interface AudioPlayerDockProps {
  waypoint: Waypoint | null;
  narration: MonumentNarration | null;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onPlayClip?: (audioUrl: string, text: string) => void;
  onSkipBack15: () => void;
  onSkipForward15: () => void;
  onNextWaypoint?: () => void;
  onPrevWaypoint?: () => void;
  playbackProgress: { current: number; duration: number };
  activeVoicePersona: VoicePersonaId;
  onChangeVoicePersona: (personaId: VoicePersonaId) => void;
  playbackSpeed: number;
  onChangePlaybackSpeed: (speed: number) => void;
  onOpenVoiceAssistant: () => void;
  isSavedAsFavorite: boolean;
  onToggleSaveFavorite: () => void;
}

const ClipButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="ml-auto flex items-center gap-1 rounded-full bg-[#1e5e7f]/40 border border-[#1e5e7f]/60 px-2.5 py-1 text-[10px] font-bold text-[#cfeaf7] normal-case tracking-normal hover:bg-[#1e5e7f]/70 transition-colors"
    aria-label="Ascolta"
  >
    <Volume2 className="w-3 h-3" />
    Ascolta
  </button>
);

export const AudioPlayerDock: React.FC<AudioPlayerDockProps> = ({
  waypoint,
  narration,
  isPlaying,
  onTogglePlay,
  onPlayClip,
  onSkipBack15,
  onSkipForward15,
  onNextWaypoint,
  onPrevWaypoint,
  playbackProgress,
  activeVoicePersona,
  onChangeVoicePersona,
  playbackSpeed,
  onChangePlaybackSpeed,
  onOpenVoiceAssistant,
  isSavedAsFavorite,
  onToggleSaveFavorite,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const recorded = getRecordedAudio(waypoint?.id);
  const [selectedQuizOption, setSelectedQuizOption] = useState<number | null>(null);
  const [showQuizResult, setShowQuizResult] = useState(false);

  if (!waypoint || !narration) return null;

  const currentPersona =
    VOICE_PERSONAS.find((p) => p.id === activeVoicePersona) || VOICE_PERSONAS[0];

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '0:00';
    const mins = Math.floor(secs / 60);
    const rem = Math.floor(secs % 60);
    return `${mins}:${rem < 10 ? '0' : ''}${rem}`;
  };

  const progressPercent = playbackProgress.duration
    ? Math.min(100, (playbackProgress.current / playbackProgress.duration) * 100)
    : isPlaying
    ? 45
    : 0;

  return (
    <>
      {/* 1. Floating Mini Player (always accessible above tabs) */}
      {!isExpanded && (
        <div className="fixed bottom-18 left-3 right-3 sm:left-auto sm:right-6 sm:w-96 z-40 bg-[#0c141d]/95 border border-[#1e5e7f]/40 rounded-2xl shadow-2xl backdrop-blur-xl p-3 flex items-center justify-between gap-3 text-stone-100 transition-all hover:border-[#389ac3]">
          {/* Progress bar line at the top */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-stone-900 rounded-t-2xl overflow-hidden">
            <div
              className="h-full bg-[#1e5e7f] transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div
            onClick={() => setIsExpanded(true)}
            className="flex items-center gap-3 min-w-0 cursor-pointer flex-1"
          >
            <div className="relative w-12 h-12 rounded-xl overflow-hidden shrink-0 border border-[#1e5e7f]/30 bg-[#121c27]">
              <img
                src={waypoint.coverImage || 'https://images.unsplash.com/photo-1552832230-c0197dd311b5?auto=format&fit=crop&w=200&q=80'}
                alt={waypoint.name}
                className="w-full h-full object-cover"
              />
              {isPlaying && (
                <div className="absolute inset-0 bg-[#080d14]/60 flex items-center justify-center gap-0.5">
                  <span className="w-1 h-3 bg-[#79c3e6] rounded-full animate-bounce"></span>
                  <span className="w-1 h-5 bg-[#79c3e6] rounded-full animate-bounce [animation-delay:150ms]"></span>
                  <span className="w-1 h-2 bg-[#79c3e6] rounded-full animate-bounce [animation-delay:300ms]"></span>
                </div>
              )}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[11px] text-[#79c3e6] font-semibold truncate">
                <Volume2 className="w-3.5 h-3.5 shrink-0" />
                <span>Almagora: {currentPersona.name}</span>
              </div>
              <div className="text-sm font-semibold truncate text-stone-100">
                {waypoint.name}
              </div>
            </div>
          </div>

          {/* Quick controls */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpenVoiceAssistant();
              }}
              title="Parla con Almagora in cuffia"
              className="w-9 h-9 rounded-full bg-[#152332] hover:bg-[#1e5e7f] text-[#79c3e6] hover:text-white flex items-center justify-center transition-colors"
            >
              <Mic className="w-4 h-4" />
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                onTogglePlay();
              }}
              className="w-10 h-10 rounded-full bg-[#1e5e7f] hover:bg-[#287096] text-white flex items-center justify-center shadow-lg transition-transform active:scale-95"
            >
              {isPlaying ? (
                <Pause className="w-4 h-4 fill-current" />
              ) : (
                <Play className="w-4 h-4 fill-current ml-0.5" />
              )}
            </button>

            <button
              onClick={() => setIsExpanded(true)}
              className="w-8 h-8 text-stone-400 hover:text-stone-200 flex items-center justify-center transition-colors"
            >
              <ChevronUp className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* 2. Full-Screen Immersive Audio Sheet */}
      {isExpanded && (
        <div className="fixed inset-0 z-50 bg-[#080d14]/98 backdrop-blur-2xl flex flex-col justify-between overflow-y-auto animate-in fade-in slide-in-from-bottom-8 duration-300">
          {/* Header */}
          <div className="sticky top-0 z-10 px-4 py-3 bg-[#0c141d]/90 backdrop-blur-md border-b border-[#1e5e7f]/20 flex items-center justify-between">
            <button
              onClick={() => setIsExpanded(false)}
              className="p-2 text-stone-400 hover:text-stone-100 rounded-xl bg-[#121c27] border border-stone-800 transition-colors"
            >
              <ChevronDown className="w-5 h-5" />
            </button>
            <div className="text-center">
              <span className="text-xs font-semibold tracking-wider uppercase text-[#79c3e6]">
                Guida Vocale Attiva
              </span>
              <h4 className="text-sm font-bold text-stone-200 truncate max-w-[200px]">
                {waypoint.name}
              </h4>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={onToggleSaveFavorite}
                className={`p-2 rounded-xl border transition-colors ${
                  isSavedAsFavorite
                    ? 'bg-[#1e5e7f]/30 text-[#79c3e6] border-[#1e5e7f]'
                    : 'bg-[#121c27] text-stone-400 hover:text-stone-100 border-stone-800'
                }`}
              >
                <Bookmark className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="p-5 max-w-xl mx-auto w-full space-y-6">
            {/* Monument Hero Image with subtle glow */}
            <div className="relative rounded-2xl overflow-hidden aspect-video shadow-2xl border border-[#1e5e7f]/30 group">
              <img
                src={waypoint.coverImage || 'https://images.unsplash.com/photo-1552832230-c0197dd311b5?auto=format&fit=crop&w=800&q=80'}
                alt={waypoint.name}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#080d14] via-[#080d14]/30 to-transparent"></div>
              
              <div className="absolute bottom-3 left-4 right-4">
                <span className="text-xs font-medium text-[#79c3e6] uppercase tracking-wider">
                  {narration.subtitle}
                </span>
                <h2 className="text-xl font-bold text-white font-serif tracking-tight">
                  {narration.title}
                </h2>
              </div>
            </div>

            {/* Audio Waveform & Status Indicator */}
            <div className="flex items-center justify-between bg-[#0e1722] border border-[#1e5e7f]/30 rounded-xl px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></div>
                <span className="text-xs text-stone-300 font-medium">
                  {isPlaying ? 'Almagora sta parlando nelle cuffie...' : 'In pausa'}
                </span>
              </div>
              <div className="flex items-center gap-1 h-5">
                {[...Array(12)].map((_, i) => (
                  <span
                    key={i}
                    className={`w-1 rounded-full transition-all duration-200 ${
                      isPlaying
                        ? 'bg-[#389ac3] animate-pulse'
                        : 'bg-stone-700 h-2'
                    }`}
                    style={{
                      height: isPlaying ? `${Math.max(4, ((i * 7) % 20) + 4)}px` : '6px',
                      animationDelay: `${i * 80}ms`,
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Audio Progress Scrubber */}
            <div className="space-y-1.5">
              <div className="w-full h-2 bg-[#121c27] rounded-full overflow-hidden cursor-pointer relative border border-[#1e5e7f]/20">
                <div
                  className="h-full bg-gradient-to-r from-[#1e5e7f] to-[#389ac3] rounded-full transition-all duration-200"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-stone-400 font-mono">
                <span>{formatTime(playbackProgress.current)}</span>
                <span>{formatTime(playbackProgress.duration || 120)}</span>
              </div>
            </div>

            {/* Audio Controls Bar */}
            <div className="flex items-center justify-center gap-6 py-2">
              <button
                onClick={onSkipBack15}
                title="Riavvolgi 15s"
                className="p-3 text-stone-300 hover:text-[#79c3e6] transition-colors"
              >
                <RotateCcw className="w-6 h-6" />
                <span className="text-[10px] block mt-0.5 font-mono">15s</span>
              </button>

              <button
                onClick={onTogglePlay}
                className="w-16 h-16 rounded-full bg-[#1e5e7f] hover:bg-[#287096] text-white flex items-center justify-center shadow-2xl transition-transform active:scale-95"
              >
                {isPlaying ? (
                  <Pause className="w-7 h-7 fill-current" />
                ) : (
                  <Play className="w-7 h-7 fill-current ml-1" />
                )}
              </button>

              <button
                onClick={onSkipForward15}
                title="Avanza 15s"
                className="p-3 text-stone-300 hover:text-[#79c3e6] transition-colors"
              >
                <FastForward className="w-6 h-6" />
                <span className="text-[10px] block mt-0.5 font-mono">15s</span>
              </button>
            </div>

            {/* Playback Speed & Voice Persona Selector */}
            <div className="flex items-center justify-between border-t border-b border-[#1e5e7f]/20 py-3 gap-2">
              {/* Speed Buttons */}
              <div className="flex items-center gap-1 bg-[#121c27] p-1 rounded-lg border border-stone-800">
                {[0.8, 1.0, 1.25, 1.5].map((spd) => (
                  <button
                    key={spd}
                    onClick={() => onChangePlaybackSpeed(spd)}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                      playbackSpeed === spd
                        ? 'bg-[#1e5e7f] text-white'
                        : 'text-stone-400 hover:text-stone-200'
                    }`}
                  >
                    {spd}x
                  </button>
                ))}
              </div>

              {/* Persona Selector Dropdown / Pills */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-stone-400">Voce:</span>
                <div className="flex items-center gap-1 bg-[#121c27] p-1 rounded-lg border border-stone-800">
                  {VOICE_PERSONAS.map((persona) => (
                    <button
                      key={persona.id}
                      onClick={() => onChangeVoicePersona(persona.id)}
                      title={persona.description}
                      className={`px-2 py-1 text-xs font-medium rounded-md transition-colors ${
                        activeVoicePersona === persona.id
                          ? 'bg-[#1e5e7f] text-white shadow-sm'
                          : 'text-stone-400 hover:text-stone-200'
                      }`}
                    >
                      {persona.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Conversational Hands-free Q&A Prompt Bar */}
            <div className="bg-gradient-to-r from-[#1e5e7f]/20 via-[#1e5e7f]/10 to-transparent border border-[#1e5e7f]/30 rounded-2xl p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#1e5e7f]/30 text-[#79c3e6] flex items-center justify-center shrink-0 border border-[#1e5e7f]/40">
                  <Mic className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-stone-100">
                    Hai una curiosità? Chiedi in cuffia
                  </div>
                  <div className="text-xs text-stone-400">
                    Tocca per parlare con Almagora o usa il tasto degli auricolari
                  </div>
                </div>
              </div>
              <button
                onClick={onOpenVoiceAssistant}
                className="px-3.5 py-2 bg-[#1e5e7f] hover:bg-[#287096] text-white text-xs font-bold rounded-xl shadow transition-transform active:scale-95 shrink-0"
              >
                Parla ora
              </button>
            </div>

            {/* Narration Transcript Text (what is being read in headphones) */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#79c3e6] uppercase tracking-wider">
                <Volume2 className="w-4 h-4" />
                <span>Testo della narrazione in ascolto</span>
              </div>
              <div className="bg-[#0e1722] border border-[#1e5e7f]/20 rounded-2xl p-4 text-stone-200 text-sm leading-relaxed font-sans">
                {narration.spokenNarration}
              </div>
            </div>

            {/* Secret Detail & Observation Tip */}
            {narration.secretDetails && (
              <div className="bg-[#102433] border border-[#1e5e7f]/40 rounded-2xl p-4 space-y-1.5">
                <div className="flex items-center gap-2 text-[#79c3e6] text-xs font-bold uppercase tracking-wider">
                  <Sparkles className="w-4 h-4" />
                  <span>Dettaglio Nascosto da Cercare con gli Occhi</span>
                  {recorded?.secret && onPlayClip && (
                    <ClipButton onClick={() => onPlayClip(recorded.secret!, narration.secretDetails)} />
                  )}
                </div>
                <p className="text-sm text-stone-200 leading-relaxed">
                  {narration.secretDetails}
                </p>
              </div>
            )}

            {/* 3 Historical Highlights */}
            {narration.historicalHighlights?.length > 0 && (
              <div className="space-y-2.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-stone-400">
                  3 Fatti Storici Essenziali
                </h4>
                <div className="space-y-2">
                  {narration.historicalHighlights.map((fact, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-3 bg-[#0e1722] border border-stone-800/80 rounded-xl p-3 text-xs text-stone-300"
                    >
                      <span className="w-5 h-5 rounded-full bg-[#1e5e7f]/30 text-[#79c3e6] border border-[#1e5e7f]/50 flex items-center justify-center font-bold text-[10px] shrink-0">
                        {idx + 1}
                      </span>
                      <span className="leading-relaxed">{fact}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Insider Tip (Local secret coffee/viewpoint) */}
            {narration.insiderTip && (
              <div className="bg-[#0e1722] border border-stone-800 rounded-2xl p-4 space-y-1">
                <div className="flex items-center gap-2 text-xs font-bold text-[#79c3e6] uppercase tracking-wider">
                  <Compass className="w-4 h-4" />
                  <span>Consiglio da Insider Locale</span>
                  {recorded?.insiderTip && onPlayClip && (
                    <ClipButton onClick={() => onPlayClip(recorded.insiderTip!, narration.insiderTip)} />
                  )}
                </div>
                <p className="text-xs text-stone-300 leading-relaxed">
                  {narration.insiderTip}
                </p>
              </div>
            )}

            {/* Interactive Visual Quiz */}
            {narration.trivia && (
              <div className="bg-[#0e1722] border border-[#1e5e7f]/20 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#79c3e6] uppercase tracking-wider">
                    <HelpCircle className="w-4 h-4" />
                    <span>Sfida Visiva di Almagora</span>
                  </div>
                  <span className="text-[11px] text-stone-400">Guarda il monumento</span>
                </div>
                <p className="text-sm font-semibold text-stone-100">
                  {narration.trivia.question}
                </p>
                <div className="space-y-2">
                  {narration.trivia.options.map((opt, idx) => {
                    const isSelected = selectedQuizOption === idx;
                    const isCorrect = idx === narration.trivia?.correctAnswerIndex;
                    return (
                      <button
                        key={idx}
                        onClick={() => {
                          setSelectedQuizOption(idx);
                          setShowQuizResult(true);
                        }}
                        className={`w-full text-left p-3 rounded-xl border text-xs transition-colors flex items-center justify-between ${
                          showQuizResult
                            ? isCorrect
                              ? 'bg-emerald-950/40 border-emerald-500/60 text-emerald-300 font-semibold'
                              : isSelected
                              ? 'bg-red-950/40 border-red-500/60 text-red-300'
                              : 'bg-stone-900/60 border-stone-800 text-stone-400'
                            : 'bg-stone-900/60 border-stone-800 text-stone-300 hover:border-[#1e5e7f]'
                        }`}
                      >
                        <span>{opt}</span>
                        {showQuizResult && isCorrect && (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
                {showQuizResult && (
                  <p className="text-xs text-stone-400 bg-stone-950/60 p-2.5 rounded-lg border border-stone-800">
                    {narration.trivia.explanation}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Bottom Close Button */}
          <div className="sticky bottom-0 bg-[#0c141d]/90 border-t border-stone-800 p-4 text-center">
            <button
              onClick={() => setIsExpanded(false)}
              className="w-full max-w-sm mx-auto py-2.5 bg-[#121c27] hover:bg-[#1a293a] border border-[#1e5e7f]/30 text-stone-200 text-xs font-semibold rounded-xl transition-colors"
            >
              Riduci alla mappa
            </button>
          </div>
        </div>
      )}
    </>
  );
};
