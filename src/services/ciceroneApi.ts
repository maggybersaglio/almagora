import { MonumentNarration, Tour, UserProfile, VoicePersonaId } from '../types/tour';

export function createDefaultNarration(
  monument: { name: string; teaser?: string },
  city: string = 'Padova'
): MonumentNarration {
  const teaser = monument.teaser || 'Meraviglia storica di inestimabile valore artistico e culturale.';
  return {
    title: monument.name,
    subtitle: `Meraviglia di ${city}`,
    spokenNarration: `Ti trovi a pochi passi da ${monument.name}. ${teaser} Fermati un momento e osserva con attenzione: la luce naturale esalta ogni profilo della struttura e le venature della pietra raccontano secoli di vita, segreti e storie vissute proprio su questo selciato.`,
    historicalHighlights: [
      teaser,
      'Opera simbolo ammirata da viaggiatori, artisti e studiosi di tutte le epoche.',
      'Testimone viva delle trasformazioni storiche, artistiche ed architettoniche più significative.',
    ],
    secretDetails: 'Cerca con lo sguardo alla base delle colonne o lungo i portali per scorgere incisioni e marchi originali.',
    insiderTip: 'La visuale prospettica più suggestiva si ha indietreggiando di qualche passo verso l’angolo opposto.',
    trivia: {
      question: `Qual è la caratteristica visiva più distintiva di ${monument.name}?`,
      options: [
        'La pietra o il marmo locale impiegato nella struttura',
        'La presenza di una cupola o volta monumentale',
        'Le decorazioni scultoree e i rilievi dell’epoca',
      ],
      correctAnswerIndex: 0,
      explanation: 'I materiali e le geometrie costruttive conferiscono alla struttura una tonalità inconfondibile che muta riflessi durante la giornata.',
    },
    suggestedQuestions: [
      'Qual è la leggenda o il mistero più celebre di questo luogo?',
      'Chi commissionò la sua costruzione e quali furono gli eventi salienti?',
      'Ci sono botteghe o caffè storici autentici nelle immediate vicinanze?',
    ],
  };
}

export async function fetchMonumentNarration(params: {
  monumentName: string;
  city?: string;
  userInterests?: string[];
  voicePersona?: VoicePersonaId;
  language?: string;
  isOffline?: boolean;
}): Promise<MonumentNarration> {
  try {
    const res = await fetch('/api/cicerone/narrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new Error('Failed to fetch narration');
    return await res.json();
  } catch (err) {
    console.warn('API error, returning local fallback narration:', err);
    return createDefaultNarration({ name: params.monumentName }, params.city || 'Padova');
  }
}

export class CiceroneAiError extends Error {}

export async function askCiceroneQuestion(params: {
  question: string;
  currentMonument?: string;
  city?: string;
  voicePersona?: VoicePersonaId;
  language?: string;
  conversationHistory?: { sender: 'user' | 'cicerone'; text: string }[];
  userLocation?: { lat: number; lng: number } | null;
}): Promise<{ answer: string; timestamp: string }> {
  let res: Response;
  try {
    res = await fetch('/api/cicerone/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
  } catch {
    throw new CiceroneAiError('Server non raggiungibile. Controlla la connessione e riprova.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.answer) {
    throw new CiceroneAiError(data.message || 'Non sono riuscito a ottenere una risposta dall’AI. Riprova.');
  }
  return data;
}

export async function transcribeAudioBlob(blob: Blob): Promise<string> {
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const res = reader.result as string;
      const clean = res.split(',')[1] || '';
      resolve(clean);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  const res = await fetch('/api/cicerone/transcribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      audioBase64: base64,
      mimeType: blob.type || 'audio/webm',
    }),
  });

  if (!res.ok) {
    throw new Error('Transcription failed');
  }
  const data = await res.json();
  return data.transcript || '';
}

export async function generateCustomTour(params: {
  city: string;
  theme: string;
  durationMinutes: number;
  userInterests: string[];
  startCoordinates?: { lat: number; lng: number };
}): Promise<Tour> {
  try {
    const res = await fetch('/api/cicerone/generate-tour', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (res.ok) {
      const data = await res.json();
      return {
        id: data.tourId || `tour-ai-${Date.now()}`,
        title: data.title || `Tour a ${params.city}`,
        city: data.city || params.city,
        country: 'Italia',
        tagline: data.tagline || 'Itinerario personalizzato generato da Cicerone AI',
        description: `Itinerario a ${params.city} focalizzato su ${params.theme}, ottimizzato per camminata con auricolari e narrazione automatica GPS.`,
        coverImage: 'https://images.unsplash.com/photo-1543429776-2782fc8e1acd?auto=format&fit=crop&w=1200&q=80',
        estimatedKm: data.estimatedKm || 2.5,
        estimatedMinutes: data.estimatedMinutes || params.durationMinutes,
        waypointsCount: data.waypoints?.length || 4,
        difficulty: 'Facile',
        theme: params.theme,
        isProOnly: false,
        tags: [params.city, 'AI Tour', params.theme],
        waypoints: data.waypoints || [],
      };
    }
  } catch (err) {
    console.warn('Network error in generateCustomTour, creating fallback tour:', err);
  }

  // Resilient fallback if server route is unreachable
  const startLat = params.startCoordinates?.lat || 45.4072;
  const startLng = params.startCoordinates?.lng || 11.8756;
  return {
    id: `tour-ai-${Date.now()}`,
    title: `Itinerario di ${params.city}: ${params.theme}`,
    city: params.city,
    country: 'Italia',
    tagline: `Un percorso personalizzato attraverso i luoghi più affascinanti di ${params.city}.`,
    description: `Itinerario sonoro a ${params.city} focalizzato su ${params.theme}, guidato da Cicerone AI con attivazione geofence ad ogni tappa.`,
    coverImage: 'https://images.unsplash.com/photo-1543429776-2782fc8e1acd?auto=format&fit=crop&w=1200&q=80',
    estimatedKm: 2.6,
    estimatedMinutes: params.durationMinutes,
    waypointsCount: 4,
    difficulty: 'Facile',
    theme: params.theme,
    isProOnly: false,
    tags: [params.city, 'AI Tour', params.theme],
    waypoints: [
      {
        id: `wp-${Date.now()}-1`,
        name: `Centro Storico di ${params.city}`,
        lat: startLat,
        lng: startLng,
        teaser: `Inizia qui il tuo cammino a ${params.city}: osserva le stratificazioni storiche e l’atmosfera locale.`,
        triggerRadiusMeters: 70,
        stopoverMinutes: 15,
        category: 'monument',
      },
      {
        id: `wp-${Date.now()}-2`,
        name: `Piazza Principale & Scorcio d’Epoca`,
        lat: Number((startLat + 0.0035).toFixed(5)),
        lng: Number((startLng + 0.0028).toFixed(5)),
        teaser: `Il punto di ritrovo storico dei residenti con botteghe storiche e architettura caratteristica.`,
        triggerRadiusMeters: 65,
        stopoverMinutes: 15,
        category: 'square',
      },
      {
        id: `wp-${Date.now()}-3`,
        name: `Monumento & Segreto Nascosto`,
        lat: Number((startLat + 0.0048).toFixed(5)),
        lng: Number((startLng - 0.0019).toFixed(5)),
        teaser: `Un angolo celato ai flussi turistici tradizionali legato alle leggende di ${params.city}.`,
        triggerRadiusMeters: 65,
        stopoverMinutes: 15,
        category: 'secret',
      },
      {
        id: `wp-${Date.now()}-4`,
        name: `Belvedere Panoramico di ${params.city}`,
        lat: Number((startLat + 0.0022).toFixed(5)),
        lng: Number((startLng - 0.0042).toFixed(5)),
        teaser: `Punto panoramico ideale per scattare una foto e ammirare la città al tramonto.`,
        triggerRadiusMeters: 75,
        stopoverMinutes: 15,
        category: 'viewpoint',
      },
    ],
  };
}

export async function requestTtsAudio(text: string, voiceName: string = 'Kore'): Promise<{ audioBase64: string | null; useFallback: boolean }> {
  try {
    const res = await fetch('/api/cicerone/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voiceName }),
    });
    if (!res.ok) return { audioBase64: null, useFallback: true };
    return await res.json();
  } catch {
    return { audioBase64: null, useFallback: true };
  }
}

export async function syncUserProfile(syncCode: string, profile: Partial<UserProfile>) {
  const res = await fetch(`/api/sync/${encodeURIComponent(syncCode)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile),
  });
  return await res.json();
}

export async function fetchSyncedProfile(syncCode: string): Promise<any> {
  const res = await fetch(`/api/sync/${encodeURIComponent(syncCode)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Codice non trovato');
  }
  const data = await res.json();
  return data.profile;
}

export async function createSyncCode(profile: Partial<UserProfile>): Promise<string> {
  const res = await fetch('/api/sync/create-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile),
  });
  const data = await res.json();
  return data.syncCode;
}
