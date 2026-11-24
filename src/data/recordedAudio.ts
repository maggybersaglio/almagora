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
  /** Clip opzionali, riproducibili dai pulsanti "Ascolta" nel player */
  secret?: string;
  secretText?: string;
  insiderTip?: string;
  insiderTipText?: string;
}

export interface RecordedIntro {
  /** Benvenuto in città: parte prima della prima tappa del tour, una sola volta */
  audio: string;
  text: string;
}

export const RECORDED_INTROS: Record<string, RecordedIntro> = {
  roma: {
    audio: '/audio/roma/roma_intro.mp3',
    text: 'Benvenuto a Roma. Qui ogni pietra ha duemila anni e ogni angolo nasconde una storia. Cammineremo insieme tra imperatori, gladiatori e congiure, partendo dal luogo più famoso di tutti. Metti le cuffie, alza lo sguardo e lasciati guidare. Se hai una curiosità, basta chiedere. Io sono qui.',
  },
};

export const RECORDED_WAYPOINT_AUDIO: Record<string, RecordedWaypointAudio> = {
  colosseo: {
    narration: '/audio/roma/roma_colosseo_narrazione.mp3',
    narrationText:
      'Eccolo davanti a te: il Colosseo. Fermati un momento e guarda quanti archi: sono ottanta, e ognuno era un ingresso numerato. Fu iniziato dall’imperatore Vespasiano intorno al 70 dopo Cristo e inaugurato da suo figlio Tito nell’anno 80, con cento giorni di giochi. Poteva ospitare circa cinquantamila spettatori, che entravano e si sedevano in pochi minuti. Sai perché si chiama così? Non per le sue dimensioni, ma per una gigantesca statua di Nerone, il Colosso, che si ergeva qui accanto. E pensa: questo anfiteatro sorge dove prima c’era il lago del palazzo di Nerone. Quel lago, dopo di lui, fu restituito ai romani.',
    secret: '/audio/roma/roma_colosseo_segreto.mp3',
    secretText:
      'Guarda le pareti dell’anello più alto: ci sono dei fori e delle mensole di pietra. Servivano a sostenere i pali del velario, un enorme telo che ombreggiava gli spalti, manovrato dai marinai della flotta imperiale.',
    insiderTip: '/audio/roma/roma_colosseo_consiglio.mp3',
    insiderTipText:
      'Vieni al tramonto: la pietra di travertino diventa dorata, e da qui verso il Foro hai la luce più bella per le foto.',
  },
};

export function getRecordedAudio(waypointId?: string | null): RecordedWaypointAudio | null {
  return (waypointId && RECORDED_WAYPOINT_AUDIO[waypointId]) || null;
}

export function getRecordedIntro(city?: string | null): RecordedIntro | null {
  return (city && RECORDED_INTROS[city.toLowerCase()]) || null;
}

/** Se la tappa ha una registrazione, mostra i testi registrati invece di quelli generati. */
export function withRecordedText(waypointId: string | undefined, narration: MonumentNarration): MonumentNarration {
  const rec = getRecordedAudio(waypointId);
  if (!rec) return narration;
  return {
    ...narration,
    spokenNarration: rec.narrationText,
    secretDetails: rec.secretText || narration.secretDetails,
    insiderTip: rec.insiderTipText || narration.insiderTip,
  };
}
