import express from 'express';
import { GoogleGenAI, Type } from '@google/genai';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { generateSmartMonumentAnswer, MONUMENT_KNOWLEDGE_BASE } from './src/data/monumentKnowledge.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '10mb' }));

// Dynamic Gemini client getter (checks process.env.GEMINI_API_KEY or process.env.API_KEY dynamically on every call)
function getGeminiClient(): GoogleGenAI | null {
  const key = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
  if (!key || key === 'MY_GEMINI_API_KEY' || key.trim().length < 8) {
    return null;
  }
  return new GoogleGenAI({
    apiKey: key.trim(),
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// In-memory cross-device cloud sync store (persisted in RAM during session)
interface SyncProfileData {
  userId: string;
  email: string;
  name: string;
  subscriptionTier: 'free' | 'pro' | 'pro_annual';
  favorites: string[];
  completedTours: string[];
  visitedMonuments: string[];
  badges: string[];
  customTours: any[];
  settings: {
    voicePersona: string;
    speechSpeed: number;
    autoTriggerDistance: number;
    language: string;
    handsFreeMode: boolean;
  };
  lastUpdated: string;
}

const syncStore = new Map<string, SyncProfileData>();

// Seed a default demo sync code so the user can test instant multi-device restore
syncStore.set('CICERONE-DEMO', {
  userId: 'user-demo-1',
  email: 'viaggiatore.esplora@cicerone.ai',
  name: 'Marco & Giulia',
  subscriptionTier: 'pro',
  favorites: ['roma-imperiale', 'firenze-rinascimento'],
  completedTours: ['roma-imperiale'],
  visitedMonuments: ['colosseo', 'fori-imperiali', 'pantheon'],
  badges: ['esploratore_antico', 'cuffie_oro', 'camminatore_5km'],
  customTours: [],
  settings: {
    voicePersona: 'amico',
    speechSpeed: 1.0,
    autoTriggerDistance: 70,
    language: 'it',
    handsFreeMode: true,
  },
  lastUpdated: new Date().toISOString(),
});

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';

// Chat provider: 'gemini' (default) or 'lmstudio' (local OpenAI-compatible server)
const useLmStudio = () => (process.env.LLM_PROVIDER || '').toLowerCase() === 'lmstudio';
const LMSTUDIO_URL = () => (process.env.LMSTUDIO_URL || 'http://localhost:1234/v1').replace(/\/$/, '');
const LMSTUDIO_MODEL = () => process.env.LMSTUDIO_MODEL || 'qwen/qwen3.5-9b';

// 1. Cicerone Contextual Audio Narration Endpoint
app.post('/api/cicerone/narrate', async (req, res) => {
  try {
    const {
      monumentName,
      city = 'Roma',
      userInterests = ['storia', 'arte', 'curiosità'],
      voicePersona = 'amico',
      language = 'it',
      isOffline = false,
    } = req.body;

    if (!monumentName) {
      return res.status(400).json({ error: 'monumentName is required' });
    }

    const personaDescriptions: Record<string, string> = {
      amico: 'Un amico del posto brillante, accogliente e informale, che racconta aneddoti succosi e dettagli insoliti come se stesse passeggiando con te con le cuffie.',
      professore: 'Uno storico dell’arte colto ed entusiasta, appassionato di fonti archeologiche, architettura e contesto politico dell’epoca.',
      narratore: 'Un cantastorie teatrale ed evocativo che fa rivivere l’atmosfera d’epoca, le passioni dei personaggi storici e le leggende misteriose.',
      famiglia: 'Una guida giocosa e divertente, adatta a tutta la famiglia con similitudini curiose e dettagli visivi facili da scorgere.',
    };

    const chosenPersona = personaDescriptions[voicePersona] || personaDescriptions.amico;

    const prompt = `Sei "Cicerone AI", la guida turistica audio personale più avanzata al mondo, collegata in tempo reale via cuffiette Bluetooth all'utente che sta fisicamente camminando davanti al monumento o punto d'interesse.

Luogo attuale: "${monumentName}" a "${city}".
Profilo vocale scelto: ${chosenPersona}
Interessi del viaggiatore: ${userInterests.join(', ')}.
Lingua richiesta: ${language === 'en' ? 'Inglese' : language === 'es' ? 'Spagnolo' : language === 'fr' ? 'Francese' : 'Italiano'}.

Genera una narrazione immersiva per auricolari:
1. Una narrazione parlata fluida ("spokenNarration") di circa 100-140 parole, scritta per essere ASCOLTATA in cuffia (usa tono diretto come: "Guarda verso l'arco...", "Respira l'aria di questo luogo...", "Nota quel particolare inciso nella pietra..."). Evita elenchi puntati o formule da guida cartacea.
2. 3 fatti storici o architettonici essenziali e sorprendenti.
3. Un "segreto nascosto" (un dettaglio da cercare con gli occhi subito sul posto).
4. Un consiglio pratico da insider locale (orario ideale, angolo fotografico o bar/bottega storica nei paraggi).
5. Un breve quiz a scelta multipla (trivia) con 3 opzioni per stimolare l'osservazione visiva del viaggiatore.
6. 3 domande di follow-up consigliate che il viaggiatore potrebbe pronunciare nelle cuffiette.`;

    const aiClient = getGeminiClient();
    if (aiClient) {
      const response = await aiClient.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              subtitle: { type: Type.STRING },
              spokenNarration: { type: Type.STRING },
              historicalHighlights: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              secretDetails: { type: Type.STRING },
              insiderTip: { type: Type.STRING },
              trivia: {
                type: Type.OBJECT,
                properties: {
                  question: { type: Type.STRING },
                  options: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  correctAnswerIndex: { type: Type.INTEGER },
                  explanation: { type: Type.STRING },
                },
                required: ['question', 'options', 'correctAnswerIndex', 'explanation'],
              },
              suggestedQuestions: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: [
              'title',
              'subtitle',
              'spokenNarration',
              'historicalHighlights',
              'secretDetails',
              'insiderTip',
              'suggestedQuestions',
            ],
          },
        },
      });

      const parsed = JSON.parse(response.text || '{}');
      return res.json(parsed);
    }
  } catch (error: any) {
    console.error('Error generating narration:', error);
  }
    // Fallback only for the static narration card (no API key or AI error)
    const mon = req.body.monumentName || 'Monumento Storico';
    const c = req.body.city || 'Padova';
    const kn = MONUMENT_KNOWLEDGE_BASE.find(
      (m) =>
        m.name.toLowerCase().includes(mon.toLowerCase()) ||
        mon.toLowerCase().includes(m.name.toLowerCase()) ||
        m.aliases.some((a) => mon.toLowerCase().includes(a))
    );

    return res.json({
      title: mon,
      subtitle: `Meraviglia di ${c}`,
      spokenNarration: kn
        ? `${kn.name}. ${kn.summary} ${kn.authorAndCommission} Avvicinati con calma e lasciati guidare: ${kn.hiddenSecrets}`
        : `Ti trovi davanti a ${mon}. Fermati un momento e osserva l'armonia delle forme e i dettagli scolpiti nella pietra. Ogni elemento racchiude secoli di storia e la viva memoria della città.`,
      historicalHighlights: kn
        ? [kn.authorAndCommission, kn.historyAndDates, kn.curiosities]
        : [
            'Edificato durante uno dei periodi più floridi della storia locale.',
            'Capolavoro di ingegneria e maestria artigianale antica.',
            'Custode di aneddoti e trasformazioni che hanno attraversato le epoche.',
          ],
      secretDetails: kn ? kn.hiddenSecrets : 'Osserva l’angolo alla base della facciata: troverai le incisioni lasciate dagli antichi scalpellini.',
      insiderTip: kn ? kn.foodAndNearbyTips : 'La luce migliore per fotografarlo è nel tardo pomeriggio, quando il sole dora la pietra calda.',
      trivia: {
        question: `Qual è la caratteristica distintiva di ${mon}?`,
        options: ['La proporzione architettonica storica', 'Le decorazioni e rilievi d’epoca', 'I volumi monumentali'],
        correctAnswerIndex: 0,
        explanation: kn ? kn.summary : 'Un autentico capolavoro della tradizione architettonica italiana.',
      },
      suggestedQuestions: kn
        ? [
            `Chi commissionò ${kn.name} e perché?`,
            'Quali segreti o leggende nasconde questo luogo?',
            'Dove posso fare una pausa nei dintorni?',
          ]
        : [
            'Qual è la leggenda più famosa legata a questo posto?',
            'Chi fu il principale architetto dell’opera?',
            'Cosa si nasconde nei sotterranei?',
          ],
    });
});

// 2. Real-time Conversational Q&A (Earphones mic interaction)
// Every answer is generated by Gemini: no canned / keyword-matched replies.
// The curated knowledge base is only used as *grounding context* inside the prompt.
function languageName(code: string): string {
  return code === 'en' ? 'Inglese' : code === 'es' ? 'Spagnolo' : code === 'fr' ? 'Francese' : 'Italiano';
}

app.post('/api/cicerone/ask', async (req, res) => {
  const {
    question,
    currentMonument = '',
    city = '',
    voicePersona = 'amico',
    conversationHistory = [],
    language = 'it',
    userLocation = null,
  } = req.body || {};

  if (!question || typeof question !== 'string' || !question.trim()) {
    return res.status(400).json({ error: 'Question is required' });
  }

  const local = useLmStudio();
  const aiClient = local ? null : getGeminiClient();
  if (!local && !aiClient) {
    return res.status(503).json({
      error: 'AI_NOT_CONFIGURED',
      message: 'Il servizio AI non è configurato: imposta GEMINI_API_KEY nel file .env del server.',
    });
  }

  const monumentLc = String(currentMonument).toLowerCase();
  const monumentContext = monumentLc
    ? MONUMENT_KNOWLEDGE_BASE.find(
        (m) =>
          m.name.toLowerCase().includes(monumentLc) ||
          monumentLc.includes(m.name.toLowerCase()) ||
          m.aliases.some((a) => monumentLc.includes(a))
      )
    : undefined;

  const locationLines: string[] = [];
  if (city) locationLines.push(`Città: ${city}`);
  if (currentMonument) locationLines.push(`Tappa / luogo vicino all'utente: ${currentMonument}`);
  if (userLocation && Number.isFinite(userLocation.lat) && Number.isFinite(userLocation.lng)) {
    locationLines.push(`Coordinate GPS attuali dell'utente: ${userLocation.lat.toFixed(5)}, ${userLocation.lng.toFixed(5)}`);
  }

  const knowledgeBlock = monumentContext
    ? `\nSCHEDA VERIFICATA SUL LUOGO "${monumentContext.name}" (${monumentContext.city}) — usala come fonte affidabile quando pertinente:
- Sintesi: ${monumentContext.summary}
- Autore e committenza: ${monumentContext.authorAndCommission}
- Storia e date: ${monumentContext.historyAndDates}
- Segreti e dettagli nascosti: ${monumentContext.hiddenSecrets}
- Interno e opere: ${monumentContext.interiorAndArt}
- Cibo e pause nei dintorni: ${monumentContext.foodAndNearbyTips}
- Curiosità: ${monumentContext.curiosities}`
    : '';

  const personaTone =
    voicePersona === 'professore'
      ? 'uno storico dell’arte appassionato e colto'
      : voicePersona === 'famiglia'
      ? 'una guida vivace per famiglie e ragazzi'
      : voicePersona === 'narratore'
      ? 'un cantastorie teatrale ed evocativo'
      : 'un amico del posto brillante ed accogliente';

  const systemInstruction = `Sei Almagora, una guida turistica audio personale che conversa in tempo reale con l'utente nelle sue cuffie mentre cammina.
Profilo vocale: ${personaTone}.

POSIZIONE DELL'UTENTE
${locationLines.length ? locationLines.join('\n') : 'Non nota.'}
${knowledgeBlock}

REGOLE
1. Rispondi sempre e direttamente alla domanda posta, qualunque sia l'argomento: storia, arte, cibo, orari, trasporti, farmacie, bagni, percorsi, curiosità sul luogo in cui si trova. Non rispondere con frasi generiche né ripetere la presentazione.
2. Tieni conto della conversazione precedente (domande di follow-up come "e chi l'ha costruito?" si riferiscono a quanto detto prima).
3. Per informazioni che cambiano (orari, prezzi, eventi, attività aperte) usa la ricerca web se disponibile; se non sei sicuro dillo onestamente invece di inventare.
4. Non inventare nomi, date o fatti. Se l'informazione non è certa, segnalalo.
5. Stile parlato, naturale, adatto all'ascolto in cuffia: 2-5 frasi (circa 40-90 parole), nessun elenco puntato, nessun markdown, nessun emoji.
6. Se l'utente ti saluta o chiede chi sei, rispondi con calore presentandoti come Almagora.
7. Lingua della risposta: ${languageName(language)}.`;

  // Build real multi-turn contents from the conversation so far
  const turns: { role: 'user' | 'model'; parts: { text: string }[] }[] = [];
  if (Array.isArray(conversationHistory)) {
    for (const m of conversationHistory.slice(-12)) {
      const text = typeof m?.text === 'string' ? m.text.trim() : '';
      if (!text) continue;
      const role = m.sender === 'user' ? 'user' : 'model';
      if (turns.length === 0 && role === 'model') continue; // must start with user
      const last = turns[turns.length - 1];
      if (last && last.role === role) {
        last.parts[0].text += `\n${text}`;
      } else {
        turns.push({ role, parts: [{ text }] });
      }
    }
  }
  if (turns.length && turns[turns.length - 1].role === 'user') {
    turns.pop(); // history must end with a model turn before the new question
  }
  turns.push({ role: 'user', parts: [{ text: question.trim() }] });

  const callLmStudio = async () => {
    const messages = [
      { role: 'system', content: systemInstruction },
      ...turns.map((t) => ({ role: t.role === 'model' ? 'assistant' : 'user', content: t.parts[0].text })),
    ];
    const r = await fetch(`${LMSTUDIO_URL()}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: LMSTUDIO_MODEL(),
        messages,
        temperature: 0.7,
        max_tokens: 700,
        reasoning_effort: 'none', // no hidden "thinking": answer straight away
      }),
      signal: AbortSignal.timeout(90000),
    });
    if (!r.ok) throw new Error(`LM Studio HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const data: any = await r.json();
    const raw: string = data?.choices?.[0]?.message?.content || '';
    return raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  };

  const callGemini = async (withSearch: boolean) => {
    const response = await aiClient!.models.generateContent({
      model: GEMINI_MODEL,
      contents: turns,
      config: {
        systemInstruction,
        temperature: 0.8,
        maxOutputTokens: 600,
        abortSignal: AbortSignal.timeout(25000),
        ...(withSearch ? { tools: [{ googleSearch: {} }] } : {}),
      },
    });
    return response.text?.trim() || '';
  };

  try {
    let answer = '';
    if (local) {
      answer = await callLmStudio();
    } else try {
      answer = await callGemini(true); // grounded with Google Search for live/real-world info
    } catch (searchErr: any) {
      console.warn('Gemini + Google Search failed, retrying without search:', searchErr?.message);
    }
    if (!answer && !local) answer = await callGemini(false);

    if (!answer) {
      return res.status(502).json({ error: 'EMPTY_RESPONSE', message: 'L’AI non ha restituito una risposta. Riprova.' });
    }
    return res.json({ answer, timestamp: new Date().toISOString(), source: local ? 'lmstudio' : 'gemini-ai' });
  } catch (error: any) {
    console.error('Gemini API error in /api/cicerone/ask:', error?.message || error);
    return res.status(502).json({
      error: 'AI_REQUEST_FAILED',
      message: 'Non riesco a contattare l’AI in questo momento. Riprova tra qualche istante.',
    });
  }
});

// 2b. Voice Audio Transcription Endpoint (Gemini Multimodal Audio Speech-to-Text)
app.post('/api/cicerone/transcribe', async (req, res) => {
  try {
    const { audioBase64, mimeType = 'audio/webm' } = req.body;
    if (!audioBase64) {
      return res.status(400).json({ error: 'audioBase64 is required', transcript: '' });
    }

    const aiClient = getGeminiClient();
    if (!aiClient) {
      return res.status(503).json({ error: 'AI transcription service unavailable', transcript: '' });
    }

    const cleanBase64 = audioBase64.replace(/^data:audio\/\w+;base64,/, '');

    const response = await aiClient.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          inlineData: {
            mimeType: mimeType.split(';')[0] || 'audio/webm',
            data: cleanBase64,
          },
        },
        'Trascrivi fedelmente la domanda o le parole pronunciate dall’utente in italiano. Restituisci ESCLUSIVAMENTE il testo trascritto, senza virgolette, senza preamboli, senza punteggiatura superflua.',
      ],
    });

    const transcript = response.text?.trim() || '';
    return res.json({ transcript });
  } catch (error: any) {
    console.error('Error transcribing audio:', error);
    return res.status(500).json({ error: 'Errore trascrizione vocale', transcript: '' });
  }
});

// 3. Dynamic Tour Generation Endpoint (AI custom itineraries)
app.post('/api/cicerone/generate-tour', async (req, res) => {
  const {
    city = 'Padova',
    theme = 'Misteri e Luoghi Nascosti',
    durationMinutes = 75,
    userInterests = ['arte', 'leggende'],
    startCoordinates = { lat: 45.4072, lng: 11.8756 },
  } = req.body;

  // 1. Try Gemini AI if API key is present
  const aiClient = getGeminiClient();
  if (aiClient) {
    try {
      const prompt = `Crea un itinerario a piedi dettagliato per un tour guidato a "${city}".
Tema del tour: "${theme}".
Durata stimata: circa ${durationMinutes} minuti.
Interessi: ${userInterests.join(', ')}.
Coordinate di partenza approssimative: lat ${startCoordinates.lat}, lng ${startCoordinates.lng}.

Genera 4 o 5 tappe sequenziali a piedi con coordinate geografiche reali e precise nella città specificata (${city}).
Ogni tappa deve avere:
- id unico (stringa kebab-case)
- nome del monumento o scorcio
- coordinate reali (latitudine, longitudine come numeri decimali precisi)
- breve teaser descrittivo (30 parole)
- raggio di attivazione GPS consigliato (es. 60-80 metri)
- tempo stimato di sosta in minuti`;

      const response = await aiClient.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              tourId: { type: Type.STRING },
              title: { type: Type.STRING },
              tagline: { type: Type.STRING },
              city: { type: Type.STRING },
              estimatedKm: { type: Type.NUMBER },
              estimatedMinutes: { type: Type.INTEGER },
              difficulty: { type: Type.STRING },
              waypoints: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    name: { type: Type.STRING },
                    lat: { type: Type.NUMBER },
                    lng: { type: Type.NUMBER },
                    teaser: { type: Type.STRING },
                    triggerRadiusMeters: { type: Type.INTEGER },
                    stopoverMinutes: { type: Type.INTEGER },
                  },
                  required: ['id', 'name', 'lat', 'lng', 'teaser', 'triggerRadiusMeters'],
                },
              },
            },
            required: ['title', 'tagline', 'city', 'estimatedKm', 'estimatedMinutes', 'waypoints'],
          },
        },
      });

      const parsed = JSON.parse(response.text || '{}');
      if (parsed.waypoints && parsed.waypoints.length > 0) {
        return res.json(parsed);
      }
    } catch (error: any) {
      console.warn('Gemini generate-tour error, falling back to curated city generator:', error.message);
    }
  }

  // 2. Intelligent Curated City Engine fallback
  const normalizedCity = city.toLowerCase().trim();

  let fallbackWaypoints: any[] = [];
  let centerLat = startCoordinates.lat || 45.4072;
  let centerLng = startCoordinates.lng || 11.8756;
  let tourTitle = `Itinerario di ${city}: ${theme}`;
  let tourTagline = `Scorci, architettura e segreti storici lungo il percorso.`;

  if (normalizedCity.includes('padov')) {
    centerLat = 45.4072;
    centerLng = 11.8756;
    tourTitle = `Padova: ${theme}`;
    tourTagline = `Dalla Cappella degli Scrovegni al Salone della Ragione e Prato della Valle.`;
    fallbackWaypoints = [
      {
        id: `padova-scrovegni-${Date.now()}`,
        name: 'Cappella degli Scrovegni',
        lat: 45.4118,
        lng: 11.8796,
        teaser: 'Il capolavoro di Giotto: la volta celeste in lapislazzuli e la prospettiva che rivoluzionò l’arte occidentale.',
        triggerRadiusMeters: 70,
        stopoverMinutes: 20,
        category: 'church',
      },
      {
        id: `padova-pedrocchi-${Date.now()}`,
        name: 'Caffè Pedrocchi',
        lat: 45.4076,
        lng: 11.8778,
        teaser: 'Il celebre caffè senza porte dell’800 e la tradizione del caffè alla menta servito senza zucchero.',
        triggerRadiusMeters: 60,
        stopoverMinutes: 12,
        category: 'secret',
      },
      {
        id: `padova-ragione-${Date.now()}`,
        name: 'Palazzo della Ragione & Piazza delle Erbe',
        lat: 45.4072,
        lng: 11.8756,
        teaser: 'Il Salone pensile con la gigantesca carena di nave lignea rovesciata e il ciclo astrologico medievale.',
        triggerRadiusMeters: 65,
        stopoverMinutes: 15,
        category: 'monument',
      },
      {
        id: `padova-santo-${Date.now()}`,
        name: 'Basilica di Sant’Antonio (Il Santo)',
        lat: 45.4014,
        lng: 11.8798,
        teaser: 'Le cupole bizantine, il monumento equestre di Donatello e secoli di devozione e pellegrinaggio.',
        triggerRadiusMeters: 75,
        stopoverMinutes: 18,
        category: 'church',
      },
      {
        id: `padova-prato-${Date.now()}`,
        name: 'Prato della Valle',
        lat: 45.3983,
        lng: 11.8765,
        teaser: 'L’Isola Memmia con le 78 statue di scienziati e letterati circondata dal doppio anello d’acqua.',
        triggerRadiusMeters: 80,
        stopoverMinutes: 15,
        category: 'square',
      },
    ];
  } else if (normalizedCity.includes('veron')) {
    centerLat = 45.4388;
    centerLng = 10.9944;
    tourTitle = `Verona: ${theme}`;
    tourTagline = `Dall’anfiteatro romano dell’Arena ai vicoli medievali di Giulietta.`;
    fallbackWaypoints = [
      {
        id: `verona-arena-${Date.now()}`,
        name: 'Arena di Verona',
        lat: 45.4388,
        lng: 10.9944,
        teaser: 'L’anfiteatro romano meglio conservato al mondo: acustica leggendaria e spettacoli senza tempo.',
        triggerRadiusMeters: 75,
        stopoverMinutes: 20,
        category: 'monument',
      },
      {
        id: `verona-giulietta-${Date.now()}`,
        name: 'Casa di Giulietta & Balcone',
        lat: 45.4418,
        lng: 10.9986,
        teaser: 'Il mito shakespeariano tra lettere d’amore, stemmi scaligeri e la statua bronzea di Giulietta.',
        triggerRadiusMeters: 60,
        stopoverMinutes: 12,
        category: 'secret',
      },
      {
        id: `verona-erbe-${Date.now()}`,
        name: 'Piazza delle Erbe & Torre dei Lamberti',
        lat: 45.4429,
        lng: 10.9972,
        teaser: 'L’antico foro romano trasformato nel salotto barocco con la fontana di Madonna Verona.',
        triggerRadiusMeters: 65,
        stopoverMinutes: 15,
        category: 'square',
      },
      {
        id: `verona-castelvecchio-${Date.now()}`,
        name: 'Ponte Scaligero di Castelvecchio',
        lat: 45.4397,
        lng: 10.9877,
        teaser: 'Il ponte fortificato in mattoni rossi che attraversa l’Adige con merli a coda di rondine.',
        triggerRadiusMeters: 70,
        stopoverMinutes: 15,
        category: 'monument',
      },
    ];
  } else if (normalizedCity.includes('bologn')) {
    centerLat = 44.4939;
    centerLng = 11.3432;
    tourTitle = `Bologna: ${theme}`;
    tourTagline = `Tra le due torri, i portici patrimonio UNESCO e le botteghe storiche.`;
    fallbackWaypoints = [
      {
        id: `bologna-maggiore-${Date.now()}`,
        name: 'Piazza Maggiore & Fontana del Nettuno',
        lat: 44.4939,
        lng: 11.3432,
        teaser: 'Il cuore pulsante medievale dominato dal Nettuno del Giambologna e dalla Basilica di San Petronio.',
        triggerRadiusMeters: 75,
        stopoverMinutes: 20,
        category: 'square',
      },
      {
        id: `bologna-torri-${Date.now()}`,
        name: 'Due Torri (Asinelli & Garisenda)',
        lat: 44.4944,
        lng: 11.3468,
        teaser: 'I giganti pendenti medievali simboli incontrastati della skyline felsinea.',
        triggerRadiusMeters: 65,
        stopoverMinutes: 15,
        category: 'monument',
      },
      {
        id: `bologna-stefano-${Date.now()}`,
        name: 'Piazza & Complesso delle Sette Chiese (Santo Stefano)',
        lat: 44.4918,
        lng: 11.3486,
        teaser: 'Un dedalo mistico di cappelle, cripte e chiostri romanici che riproduce la Gerusalemme celeste.',
        triggerRadiusMeters: 70,
        stopoverMinutes: 18,
        category: 'church',
      },
    ];
  } else {
    // Dynamic procedural waypoints around the requested coordinates
    const offsets = [
      { dLat: 0.0, dLng: 0.0, name: `Porta Antica & Corso Principale di ${city}`, category: 'monument' },
      { dLat: 0.0035, dLng: 0.0028, name: `Piazza della Cattedrale & Campanile Storico`, category: 'church' },
      { dLat: 0.0048, dLng: -0.0019, name: `Palazzo Civico & Botteghe Artigiane`, category: 'secret' },
      { dLat: 0.0022, dLng: -0.0042, name: `Belvedere Panoramico & Giardino Pensile`, category: 'viewpoint' },
    ];

    fallbackWaypoints = offsets.map((o, idx) => ({
      id: `tour-${normalizedCity.replace(/[^a-z0-9]/g, '-')}-${idx + 1}`,
      name: o.name,
      lat: Number((centerLat + o.dLat).toFixed(5)),
      lng: Number((centerLng + o.dLng).toFixed(5)),
      teaser: `Tappa ${idx + 1}: esplora le tracce storiche e le atmosfere caratteristiche di ${city} legate al tema ${theme}.`,
      triggerRadiusMeters: 65,
      stopoverMinutes: 15,
      category: o.category,
    }));
  }

  return res.json({
    tourId: `tour-ai-${Date.now()}`,
    title: tourTitle,
    tagline: tourTagline,
    city,
    estimatedKm: 2.7,
    estimatedMinutes: durationMinutes,
    difficulty: 'Facile',
    waypoints: fallbackWaypoints,
  });
});

// 4. Gemini Speech Generation (TTS)
app.post('/api/cicerone/tts', async (req, res) => {
  try {
    const { text, voiceName = 'Kore' } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'Text is required for TTS' });
    }

    const aiClient = getGeminiClient();
    if (!aiClient) {
      return res.json({ audioBase64: null, useFallback: true });
    }

    // Call gemini-3.8-flash-lite-tts for ultra realistic vocal performance
    const response = await aiClient.models.generateContent({
      model: 'gemini-3.8-flash-lite-tts',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: text.slice(0, 600), // optimal length for audio clip
            },
          ],
        },
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voiceName || 'Kore' },
          },
        },
      },
    });

    const base64Audio =
      response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    if (base64Audio) {
      return res.json({
        audioBase64: base64Audio,
        mimeType: 'audio/wav',
        useFallback: false,
      });
    }

    return res.json({ audioBase64: null, useFallback: true });
  } catch (error: any) {
    console.warn('Gemini TTS unavailable, client will use Web Speech synthesis fallback:', error.message);
    return res.json({ audioBase64: null, useFallback: true });
  }
});

// 5. Cloud Sync endpoints for multi-device profile restoration
app.post('/api/sync/create-code', (req, res) => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let randomCode = 'CIC-';
  for (let i = 0; i < 6; i++) {
    randomCode += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const profileData = req.body || {};
  syncStore.set(randomCode, {
    ...profileData,
    userId: profileData.userId || `user-${Date.now()}`,
    lastUpdated: new Date().toISOString(),
  });
  return res.json({ syncCode: randomCode });
});

app.get('/api/sync/:syncCode', (req, res) => {
  const code = (req.params.syncCode || '').toUpperCase().trim();
  const data = syncStore.get(code);
  if (!data) {
    return res.status(404).json({ error: 'Codice di sincronizzazione non trovato o scaduto.' });
  }
  return res.json({ success: true, profile: data });
});

app.post('/api/sync/:syncCode', (req, res) => {
  const code = (req.params.syncCode || '').toUpperCase().trim();
  const profileData = req.body;
  if (!code || !profileData) {
    return res.status(400).json({ error: 'Parametri non validi' });
  }
  const updatedData: SyncProfileData = {
    ...profileData,
    lastUpdated: new Date().toISOString(),
  };
  syncStore.set(code, updatedData);
  return res.json({ success: true, syncCode: code, lastUpdated: updatedData.lastUpdated });
});

// Serve Vite in development or static assets in production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Cicerone AI Guide Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
