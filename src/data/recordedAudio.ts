/**
 * Registrazioni vocali reali (sostituiscono la voce sintetica).
 * I file stanno in public/audio/<città>/ e vengono serviti da /audio/...
 * Per aggiungere una nuova tappa: copia l'mp3 e aggiungi una voce qui sotto.
 */
import type { MonumentNarration } from '../types/tour';

export interface RecordedWaypointAudio {
  /** Registrazione della narrazione principale (parte con "Play") */
  narration: string;
  /** Testo letto nella registrazione: mostrato a schermo al posto di quello generato dall'AI */
  narrationText: string;
  /** Clip opzionali, non ancora collegate all'interfaccia */
  secret?: string;
  insiderTip?: string;
}

export const RECORDED_INTROS: Record<string, string> = {
  roma: '/audio/roma/roma_intro.mp3',
};

export const RECORDED_WAYPOINT_AUDIO: Record<string, RecordedWaypointAudio> = {
  colosseo: {
    narration: '/audio/roma/roma_colosseo_narrazione.mp3',
    narrationText:
      'Eccolo davanti a te: il Colosseo. Fermati un momento e guarda quanti archi: sono ottanta, e ognuno era un ingresso numerato. Fu iniziato dall’imperatore Vespasiano intorno al 70 dopo Cristo e inaugurato da suo figlio Tito nell’anno 80, con cento giorni di giochi. Poteva ospitare circa cinquantamila spettatori, che entravano e si sedevano in pochi minuti. Sai perché si chiama così? Non per le sue dimensioni, ma per una gigantesca statua di Nerone, il Colosso, che si ergeva qui accanto. E pensa: questo anfiteatro sorge dove prima c’era il lago del palazzo di Nerone. Quel lago, dopo di lui, fu restituito ai romani.',
    secret: '/audio/roma/roma_colosseo_segreto.mp3',
    insiderTip: '/audio/roma/roma_colosseo_consiglio.mp3',
  },
};

export function getRecordedAudio(waypointId?: string | null): RecordedWaypointAudio | null {
  return (waypointId && RECORDED_WAYPOINT_AUDIO[waypointId]) || null;
}

/** Se la tappa ha una registrazione, mostra il testo registrato invece di quello generato. */
export function withRecordedText(waypointId: string | undefined, narration: MonumentNarration): MonumentNarration {
  const rec = getRecordedAudio(waypointId);
  return rec ? { ...narration, spokenNarration: rec.narrationText } : narration;
}
