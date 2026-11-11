import React, { useState, useEffect, useRef } from 'react';
import { CURATED_TOURS, VOICE_PERSONAS } from './data/mockTours';
import {
  Tour,
  Waypoint,
  MonumentNarration,
  UserProfile,
  BluetoothDeviceState,
  VoicePersonaId,
} from './types/tour';
import { getRecordedAudio, withRecordedText } from './data/recordedAudio';
import { fetchMonumentNarration, createDefaultNarration, syncUserProfile, fetchSyncedProfile } from './services/ciceroneApi';
import { speechService } from './services/speechService';
import { bluetoothService } from './services/bluetoothService';
import { MapComponent } from './components/MapComponent';
import { GoogleMapComponent } from './components/GoogleMapComponent';
import { AudioPlayerDock } from './components/AudioPlayerDock';
import { Navbar } from './components/Navbar';
import { BottomNav, ActiveTab } from './components/BottomNav';
import { VoiceAssistantModal } from './components/VoiceAssistantModal';
import { BluetoothModal } from './components/BluetoothModal';
import { SubscriptionModal } from './components/SubscriptionModal';
import { ProfileSyncModal } from './components/ProfileSyncModal';
import { CreateTourModal } from './components/CreateTourModal';
import { TourDetailModal } from './components/TourDetailModal';
import {
  Compass,
  MapPin,
  Clock,
  Sparkles,
  Download,
  Bookmark,
  Play,
  CheckCircle2,
  Headphones,
  Award,
  Crown,
  Search,
  Filter,
} from 'lucide-react';

// Distance calculation between coordinates in meters
function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3; // metres
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function App() {
  // Navigation tab state
  const [activeTab, setActiveTab] = useState<ActiveTab>('explore');

  // Tours & active guide state
  const [tours, setTours] = useState<Tour[]>(CURATED_TOURS);
  const [activeTour, setActiveTour] = useState<Tour>(() => {
    return CURATED_TOURS.find((t) => t.id === 'padova-giotto-santo') || CURATED_TOURS[0];
  });
  const [activeWaypoint, setActiveWaypoint] = useState<Waypoint | null>(() => {
    const tour = CURATED_TOURS.find((t) => t.id === 'padova-giotto-santo') || CURATED_TOURS[0];
    return tour.waypoints[0] || null;
  });
  const [activeNarration, setActiveNarration] = useState<MonumentNarration>(() => {
    const tour = CURATED_TOURS.find((t) => t.id === 'padova-giotto-santo') || CURATED_TOURS[0];
    const wp = tour.waypoints[0];
    return createDefaultNarration(wp, tour.city);
  });
  const [selectedTourForDetail, setSelectedTourForDetail] = useState<Tour | null>(null);

  // User location & Walk Simulation state
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number }>(() => {
    const tour = CURATED_TOURS.find((t) => t.id === 'padova-giotto-santo') || CURATED_TOURS[0];
    return {
      lat: tour.waypoints[0].lat,
      lng: tour.waypoints[0].lng,
    };
  });
  const [isSimulatingWalk, setIsSimulatingWalk] = useState(false);
  const [simulationSpeed, setSimulationSpeed] = useState(1);
  const [simulationWaypointIndex, setSimulationWaypointIndex] = useState(0);
  const [simulationStepProgress, setSimulationStepProgress] = useState(0);

  // Audio Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState({ current: 0, duration: 120 });
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [activeVoicePersona, setActiveVoicePersona] = useState<VoicePersonaId>('amico');

  // Bluetooth earphone state
  const [bluetoothState, setBluetoothState] = useState<BluetoothDeviceState>(
    bluetoothService.getState()
  );

  // User Profile, Favorites & Sync state
  const [userProfile, setUserProfile] = useState<UserProfile>(() => {
    const saved = localStorage.getItem('cicerone_user_profile');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return {
      userId: 'user-cicerone-1',
      email: 'viaggiatore.esplora@cicerone.ai',
      name: 'Marco & Giulia',
      avatarUrl: '',
      subscriptionTier: 'free',
      syncCode: 'CIC-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
      totalKmWalked: 3.4,
      hoursListened: 1.8,
      monumentsVisited: ['colosseo', 'pantheon'],
      favoriteTourIds: ['roma-imperiale'],
      downloadedTourIds: [],
      badges: [
        {
          id: 'b-1',
          title: 'Primo Passo nell’Urbe',
          description: 'Hai ascoltato la tua prima narrazione al Colosseo',
          icon: '🏛️',
        },
        {
          id: 'b-2',
          title: 'Ascoltatore Attento',
          description: 'Oltre 1 ora di narrazione audio in cuffia',
          icon: '🎧',
        },
      ],
      customTours: [],
      settings: {
        voicePersona: 'amico',
        speechSpeed: 1.0,
        autoTriggerDistance: 70,
        language: 'it',
        handsFreeMode: true,
        vibrateOnTrigger: true,
      },
    };
  });

  // Search & Filter state for Explore tab
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCityFilter, setSelectedCityFilter] = useState<string>('Tutte');

  // Modals state
  const [showVoiceAssistant, setShowVoiceAssistant] = useState(false);
  const [showBluetoothModal, setShowBluetoothModal] = useState(false);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showCreateTourModal, setShowCreateTourModal] = useState(false);

  // Google Maps Platform Integration & Quota Defense State
  const googleMapsApiKey = (import.meta as any).env.VITE_GOOGLE_MAPS_API_KEY || '';
  const [mapProvider, setMapProvider] = useState<'google' | 'leaflet'>(googleMapsApiKey ? 'google' : 'leaflet');
  const [quotaExceeded, setQuotaExceeded] = useState(false);

  useEffect(() => {
    const handleQuotaExceeded = () => setQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handleQuotaExceeded);
    return () => window.removeEventListener('gmp-quota-exceeded', handleQuotaExceeded);
  }, []);

  // Keep Bluetooth state synced
  useEffect(() => {
    return bluetoothService.subscribe((state) => {
      setBluetoothState(state);
    });
  }, []);

  // Save profile to localStorage and sync to server
  useEffect(() => {
    localStorage.setItem('cicerone_user_profile', JSON.stringify(userProfile));
  }, [userProfile]);

  // Load narration when activeWaypoint changes
  useEffect(() => {
    if (!activeWaypoint) return;
    let isMounted = true;

    // Immediately provide instant default narration so there is ZERO delay
    setActiveNarration((current) => {
      if (current && current.title === activeWaypoint.name) {
        return current;
      }
      return createDefaultNarration(activeWaypoint, activeTour.city);
    });

    // Enrich with AI narration in the background
    fetchMonumentNarration({
      monumentName: activeWaypoint.name,
      city: activeTour.city,
      userInterests: ['archeologia', 'arte', 'segreti'],
      voicePersona: activeVoicePersona,
    }).then((narration) => {
      if (isMounted) {
        // If already playing audio, update metadata (trivia, secrets) without restarting speech
        setActiveNarration((prev) => {
          if (speechService.isPlaying()) {
            return {
              ...narration,
              spokenNarration: prev?.spokenNarration || narration.spokenNarration,
            };
          }
          return narration;
        });
      }
    });

    return () => {
      isMounted = false;
    };
  }, [activeWaypoint, activeTour.city, activeVoicePersona]);

  // Configure MediaSession for Bluetooth earphone buttons (hardware stem click / tap)
  useEffect(() => {
    if (!activeWaypoint) return;
    bluetoothService.setupMediaSession({
      title: activeWaypoint.name,
      artist: activeTour.title,
      album: `Cicerone AI - ${activeTour.city}`,
      artworkUrl:
        activeWaypoint.coverImage ||
        'https://images.unsplash.com/photo-1552832230-c0197dd311b5?auto=format&fit=crop&w=512&q=80',
      onPlay: handlePlayAudio,
      onPause: handlePauseAudio,
      onNext: handleNextWaypoint,
      onPrev: handlePrevWaypoint,
    });
  }, [activeWaypoint, activeTour]);

  // Audio Playback listener bindings
  useEffect(() => {
    speechService.onPlaybackEnd = () => {
      setIsPlaying(false);
      setPlaybackProgress((prev) => ({ ...prev, current: prev.duration }));
    };

    speechService.onPlaybackProgress = (cur, dur) => {
      setPlaybackProgress({ current: Math.round(cur), duration: Math.max(1, Math.round(dur)) });
    };

    speechService.onStateChange = (playing) => {
      setIsPlaying(playing);
    };

    return () => {
      speechService.stop();
    };
  }, []);

  // Walk Simulation Timer along the tour route
  useEffect(() => {
    if (!isSimulatingWalk || !activeTour || activeTour.waypoints.length < 2) return;

    const intervalMs = 1000 / simulationSpeed;
    const timer = setInterval(() => {
      const waypoints = activeTour.waypoints;
      const currentWp = waypoints[simulationWaypointIndex];
      const nextWp = waypoints[(simulationWaypointIndex + 1) % waypoints.length];

      setSimulationStepProgress((prevProgress) => {
        const nextProgress = prevProgress + 0.08;

        if (nextProgress >= 1.0) {
          // Reached next waypoint!
          const nextIdx = (simulationWaypointIndex + 1) % waypoints.length;
          setSimulationWaypointIndex(nextIdx);
          const reachedWp = waypoints[nextIdx];
          setUserLocation({ lat: reachedWp.lat, lng: reachedWp.lng });

          // Trigger geofence audio arrival
          handleTriggerMonumentArrival(reachedWp);
          return 0;
        } else {
          // Interpolate GPS position between waypoints
          const currentLat = currentWp.lat + (nextWp.lat - currentWp.lat) * nextProgress;
          const currentLng = currentWp.lng + (nextWp.lng - currentWp.lng) * nextProgress;
          setUserLocation({ lat: currentLat, lng: currentLng });
          return nextProgress;
        }
      });
    }, intervalMs);

    return () => clearInterval(timer);
  }, [isSimulatingWalk, simulationSpeed, simulationWaypointIndex, activeTour]);

  // Handle Geofence trigger when user approaches a monument
  const handleTriggerMonumentArrival = (wp: Waypoint) => {
    speechService.playProximityChime();
    setActiveWaypoint(wp);
    setActiveNarration(createDefaultNarration(wp, activeTour.city));

    // Update visited monuments in user profile
    setUserProfile((prev) => {
      const exists = prev.monumentsVisited.includes(wp.id);
      const updatedVisited = exists ? prev.monumentsVisited : [...prev.monumentsVisited, wp.id];
      const updatedKm = prev.totalKmWalked + 0.3;
      return {
        ...prev,
        monumentsVisited: updatedVisited,
        totalKmWalked: updatedKm,
      };
    });
  };

  const handlePlayAudio = () => {
    const narration =
      activeNarration ||
      (activeWaypoint ? createDefaultNarration(activeWaypoint, activeTour.city) : null);
    if (!narration) return;

    speechService.playNarration(getRecordedAudio(activeWaypoint?.id)?.narrationText || narration.spokenNarration, {
      speed: playbackSpeed,
      voicePersonaId: activeVoicePersona,
      audioUrl: getRecordedAudio(activeWaypoint?.id)?.narration,
      onStart: () => setIsPlaying(true),
      onEnd: () => setIsPlaying(false),
    });
    setIsPlaying(true);
  };

  const handlePauseAudio = () => {
    speechService.stop();
    setIsPlaying(false);
  };

  const handleTogglePlay = () => {
    const narration =
      activeNarration ||
      (activeWaypoint ? createDefaultNarration(activeWaypoint, activeTour.city) : null);
    if (!narration) return;

    if (speechService.isPlaying()) {
      // User clicked while playing: INTERRUPT immediately, zero parallel audio
      speechService.stop();
      setIsPlaying(false);
    } else {
      // User clicked while stopped: start single instance immediately in 0ms
      setIsPlaying(true);
      speechService.playNarration(getRecordedAudio(activeWaypoint?.id)?.narrationText || narration.spokenNarration, {
        speed: playbackSpeed,
        voicePersonaId: activeVoicePersona,
        audioUrl: getRecordedAudio(activeWaypoint?.id)?.narration,
        onStart: () => setIsPlaying(true),
        onEnd: () => setIsPlaying(false),
      });
    }
  };

  const handleSkipBack15 = () => {
    speechService.skipSeconds(-15);
  };

  const handleSkipForward15 = () => {
    speechService.skipSeconds(15);
  };

  const handleChangePlaybackSpeed = (speed: number) => {
    setPlaybackSpeed(speed);
    speechService.setSpeed(speed);
  };

  const handleNextWaypoint = () => {
    if (!activeTour || !activeWaypoint) return;
    const currentIndex = activeTour.waypoints.findIndex((w) => w.id === activeWaypoint.id);
    const nextIndex = (currentIndex + 1) % activeTour.waypoints.length;
    const nextWp = activeTour.waypoints[nextIndex];
    setActiveWaypoint(nextWp);
    setUserLocation({ lat: nextWp.lat, lng: nextWp.lng });
    handleTriggerMonumentArrival(nextWp);
  };

  const handlePrevWaypoint = () => {
    if (!activeTour || !activeWaypoint) return;
    const currentIndex = activeTour.waypoints.findIndex((w) => w.id === activeWaypoint.id);
    const prevIndex = (currentIndex - 1 + activeTour.waypoints.length) % activeTour.waypoints.length;
    const prevWp = activeTour.waypoints[prevIndex];
    setActiveWaypoint(prevWp);
    setUserLocation({ lat: prevWp.lat, lng: prevWp.lng });
  };

  const handleStartTour = (tour: Tour) => {
    setActiveTour(tour);
    const firstWp = tour.waypoints[0];
    setActiveWaypoint(firstWp);
    setUserLocation({ lat: firstWp.lat, lng: firstWp.lng });
    setSimulationWaypointIndex(0);
    setSimulationStepProgress(0);
    setActiveTab('map');
    handleTriggerMonumentArrival(firstWp);
  };

  const handleToggleFavorite = (tourId: string) => {
    setUserProfile((prev) => {
      const isFav = prev.favoriteTourIds.includes(tourId);
      return {
        ...prev,
        favoriteTourIds: isFav
          ? prev.favoriteTourIds.filter((id) => id !== tourId)
          : [...prev.favoriteTourIds, tourId],
      };
    });
  };

  const handleTourDownloaded = (tourId: string) => {
    setUserProfile((prev) => ({
      ...prev,
      downloadedTourIds: [...prev.downloadedTourIds, tourId],
    }));
  };

  const handleUpgradeTier = (tier: 'pro' | 'pro_annual') => {
    setUserProfile((prev) => ({
      ...prev,
      subscriptionTier: tier,
    }));
  };

  const handleCustomTourCreated = (newTour: Tour) => {
    setTours((prev) => [newTour, ...prev]);
    setUserProfile((prev) => ({
      ...prev,
      customTours: [newTour, ...prev.customTours],
    }));
    handleStartTour(newTour);
  };

  // Filtered tours for Explore tab
  const filteredTours = tours.filter((t) => {
    const matchesCity =
      selectedCityFilter === 'Tutte' || t.city.toLowerCase() === selectedCityFilter.toLowerCase();
    const matchesSearch =
      searchQuery === '' ||
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.city.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.theme.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCity && matchesSearch;
  });

  const favoriteTours = tours.filter((t) => userProfile.favoriteTourIds.includes(t.id));

  return (
    <div className="min-h-screen bg-[#080d14] text-stone-100 flex flex-col font-sans pb-24 sm:pb-20">
      {/* Google Maps Quota Defense Banner (Case A: Demo Key) */}
      {quotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      {/* Top Navigation */}
      <Navbar
        bluetoothState={bluetoothState}
        userProfile={userProfile}
        onOpenBluetooth={() => setShowBluetoothModal(true)}
        onOpenProfile={() => setShowProfileModal(true)}
        onOpenSubscription={() => setShowSubscriptionModal(true)}
        onOpenCreateTour={() => setShowCreateTourModal(true)}
        activeCity={activeTour.city}
      />

      {/* Main Content Area based on Active Tab */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* TAB 1: ESPLORA (Tours & Curated Guides) */}
        {activeTab === 'explore' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Hero Banner */}
            <div className="relative rounded-3xl overflow-hidden bg-gradient-to-r from-[#0c141d] via-[#0e1722] to-[#1e5e7f]/30 border border-[#1e5e7f]/40 p-6 sm:p-8 shadow-2xl">
              <div className="max-w-xl space-y-3 relative z-10">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#79c3e6] animate-ping"></span>
                  <span className="text-xs font-bold uppercase tracking-wider text-[#79c3e6]">
                    Guida Turistica Intelligente in Cuffia
                  </span>
                </div>
                <h1 className="text-2xl sm:text-4xl font-serif font-black tracking-tight text-white leading-tight">
                  Cammina. Ascolta. <br />
                  <span className="text-[#79c3e6] italic">Vivi la storia sul posto.</span>
                </h1>
                <p className="text-xs sm:text-sm text-stone-300 leading-relaxed">
                  Infila gli auricolari Bluetooth e lasciati guidare da Almagora. In base alla tua posizione GPS in tempo reale, scoprirai aneddoti, scorci nascosti e segreti storici.
                </p>
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <button
                    onClick={() => handleStartTour(activeTour)}
                    className="px-5 py-2.5 bg-[#1e5e7f] hover:bg-[#287096] text-white font-bold text-xs sm:text-sm rounded-xl shadow-lg flex items-center gap-2 transition-transform active:scale-95"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>Inizia Tour {activeTour.city}</span>
                  </button>
                  <button
                    onClick={() => setShowCreateTourModal(true)}
                    className="px-4 py-2.5 bg-[#121c27] hover:bg-[#1a293a] text-stone-200 border border-[#1e5e7f]/40 font-semibold text-xs rounded-xl flex items-center gap-2 transition-colors"
                  >
                    <Sparkles className="w-4 h-4 text-[#79c3e6]" />
                    <span>Crea Tour AI su Misura</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Search & City Filter Bar */}
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-stone-500 absolute left-3.5 top-3.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cerca percorsi, monumenti, quartieri..."
                  className="w-full bg-[#0c141d] border border-stone-800 rounded-xl pl-10 pr-4 py-2.5 text-xs sm:text-sm text-stone-100 placeholder:text-stone-500 focus:outline-none focus:border-[#389ac3]"
                />
              </div>

              {/* City Pill Selectors */}
              <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                {['Tutte', 'Padova', 'Roma', 'Firenze', 'Venezia', 'Napoli'].map((city) => (
                  <button
                    key={city}
                    onClick={() => setSelectedCityFilter(city)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-xl border transition-colors shrink-0 ${
                      selectedCityFilter === city
                        ? 'bg-[#1e5e7f] text-white border-[#389ac3] shadow-sm'
                        : 'bg-[#0c141d] border-stone-800 text-stone-400 hover:text-stone-200'
                    }`}
                  >
                    {city}
                  </button>
                ))}
              </div>
            </div>

            {/* Tour Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredTours.map((tour) => {
                const isFav = userProfile.favoriteTourIds.includes(tour.id);
                const isOffline = userProfile.downloadedTourIds.includes(tour.id);

                return (
                  <div
                    key={tour.id}
                    className="group bg-[#0c141d] border border-stone-800 rounded-2xl overflow-hidden shadow-xl hover:border-[#1e5e7f] transition-all duration-300 flex flex-col justify-between"
                  >
                    <div>
                      {/* Image Preview */}
                      <div className="relative aspect-video overflow-hidden">
                        <img
                          src={tour.coverImage}
                          alt={tour.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#0c141d] via-transparent to-transparent"></div>

                        {/* Top Pills */}
                        <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
                          <span className="text-xs font-bold text-[#79c3e6] bg-[#080d14]/85 backdrop-blur-md px-2.5 py-0.5 rounded-full border border-[#1e5e7f]/30">
                            {tour.city}
                          </span>
                          <div className="flex items-center gap-1.5">
                            {isOffline && (
                              <span
                                title="Tour scaricato per uso offline"
                                className="w-7 h-7 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-700/50 flex items-center justify-center backdrop-blur-md"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </span>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleFavorite(tour.id);
                              }}
                              className={`w-7 h-7 rounded-full flex items-center justify-center backdrop-blur-md border transition-colors ${
                                isFav
                                  ? 'bg-[#1e5e7f] text-white border-[#389ac3]'
                                  : 'bg-[#080d14]/80 text-stone-300 hover:text-white border-stone-800'
                              }`}
                            >
                              <Bookmark className="w-3.5 h-3.5 fill-current" />
                            </button>
                          </div>
                        </div>

                        {/* Bottom Tagline */}
                        <div className="absolute bottom-2 left-3 right-3 text-[11px] text-stone-300 line-clamp-1 font-medium">
                          {tour.tagline}
                        </div>
                      </div>

                      {/* Card Body */}
                      <div className="p-4 space-y-3">
                        <h3 className="text-base font-bold text-white font-serif line-clamp-1">
                          {tour.title}
                        </h3>

                        {/* Meta: distance, duration, waypoints */}
                        <div className="flex items-center gap-3 text-xs text-stone-400 font-mono">
                          <span className="flex items-center gap-1 text-[#79c3e6]">
                            <MapPin className="w-3.5 h-3.5" />
                            {tour.estimatedKm} km
                          </span>
                          <span>·</span>
                          <span className="flex items-center gap-1 text-[#79c3e6]">
                            <Clock className="w-3.5 h-3.5" />
                            {tour.estimatedMinutes} min
                          </span>
                          <span>·</span>
                          <span>{tour.waypointsCount} tappe</span>
                        </div>

                        <p className="text-xs text-stone-400 line-clamp-2 leading-relaxed">
                          {tour.description}
                        </p>
                      </div>
                    </div>

                    {/* Card Actions */}
                    <div className="p-4 pt-0 flex items-center gap-2">
                      <button
                        onClick={() => setSelectedTourForDetail(tour)}
                        className="flex-1 py-2 px-3 bg-[#121c27] hover:bg-[#1a293a] text-stone-200 text-xs font-semibold rounded-xl border border-stone-700 transition-colors"
                      >
                        Dettagli & Tappe
                      </button>
                      <button
                        onClick={() => handleStartTour(tour)}
                        className="py-2 px-4 bg-[#1e5e7f] hover:bg-[#287096] text-white text-xs font-bold rounded-xl shadow flex items-center gap-1.5 transition-transform active:scale-95"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Inizia</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 2: MAPPA LIVE & GPS AUDIO GUIDE */}
        {activeTab === 'map' && (
          <div className="h-[calc(100vh-160px)] min-h-[480px] rounded-3xl overflow-hidden border border-[#1e5e7f]/30 shadow-2xl relative flex flex-col animate-in fade-in duration-300">
            {/* Map Provider Selector (Google Maps vs OpenStreetMap) */}
            <div className="absolute top-4 right-16 z-20 bg-[#0c141d]/90 border border-[#1e5e7f]/40 rounded-xl p-1 backdrop-blur-md shadow-lg flex items-center gap-1">
              <button
                onClick={() => setMapProvider('google')}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                  mapProvider === 'google'
                    ? 'bg-[#1e5e7f] text-white shadow-sm'
                    : 'text-stone-300 hover:text-white'
                }`}
              >
                <span>Google Maps</span>
              </button>
              <button
                onClick={() => setMapProvider('leaflet')}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-colors ${
                  mapProvider === 'leaflet'
                    ? 'bg-[#1e5e7f] text-white shadow-sm'
                    : 'text-stone-300 hover:text-white'
                }`}
              >
                <span>OSM</span>
              </button>
            </div>

            {mapProvider === 'google' && googleMapsApiKey ? (
              <GoogleMapComponent
                apiKey={googleMapsApiKey}
                activeTour={activeTour}
                activeWaypoint={activeWaypoint}
                userLocation={userLocation}
                onSelectWaypoint={(wp) => {
                  setActiveWaypoint(wp);
                  setUserLocation({ lat: wp.lat, lng: wp.lng });
                  handleTriggerMonumentArrival(wp);
                }}
                onUserLocationChange={setUserLocation}
                isSimulatingWalk={isSimulatingWalk}
                onToggleSimulateWalk={() => setIsSimulatingWalk(!isSimulatingWalk)}
                simulationSpeed={simulationSpeed}
                onChangeSimulationSpeed={setSimulationSpeed}
                onResetSimulation={() => {
                  if (activeTour?.waypoints[0]) {
                    const first = activeTour.waypoints[0];
                    setUserLocation({ lat: first.lat, lng: first.lng });
                    setActiveWaypoint(first);
                    setSimulationWaypointIndex(0);
                    setSimulationStepProgress(0);
                  }
                }}
              />
            ) : (
              <MapComponent
                activeTour={activeTour}
                activeWaypoint={activeWaypoint}
                userLocation={userLocation}
                onSelectWaypoint={(wp) => {
                  setActiveWaypoint(wp);
                  setUserLocation({ lat: wp.lat, lng: wp.lng });
                  handleTriggerMonumentArrival(wp);
                }}
                onUserLocationChange={setUserLocation}
                isSimulatingWalk={isSimulatingWalk}
                onToggleSimulateWalk={() => setIsSimulatingWalk(!isSimulatingWalk)}
                simulationSpeed={simulationSpeed}
                onChangeSimulationSpeed={setSimulationSpeed}
                onResetSimulation={() => {
                  if (activeTour?.waypoints[0]) {
                    const first = activeTour.waypoints[0];
                    setUserLocation({ lat: first.lat, lng: first.lng });
                    setActiveWaypoint(first);
                    setSimulationWaypointIndex(0);
                    setSimulationStepProgress(0);
                  }
                }}
              />
            )}
          </div>
        )}

        {/* TAB 3: PREFERITI & PACCHETTI OFFLINE */}
        {activeTab === 'saved' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div>
              <h2 className="text-xl font-bold font-serif text-white">
                I Tuoi Percorsi Preferiti & Offline
              </h2>
              <p className="text-xs text-stone-400">
                Itinerari salvati e pacchetti scaricati per viaggiare anche senza roaming
              </p>
            </div>

            {favoriteTours.length === 0 ? (
              <div className="bg-[#0c141d] border border-stone-800 rounded-3xl p-8 text-center space-y-3">
                <Bookmark className="w-10 h-10 text-stone-500 mx-auto" />
                <h4 className="text-sm font-semibold text-stone-200">
                  Nessun tour nei preferiti
                </h4>
                <p className="text-xs text-stone-400 max-w-sm mx-auto">
                  Esplora gli itinerari di Padova, Roma, Firenze, Venezia o Napoli e tocca l'icona del segnalibro per salvarli qui.
                </p>
                <button
                  onClick={() => setActiveTab('explore')}
                  className="px-4 py-2 bg-[#1e5e7f] hover:bg-[#287096] text-white font-bold text-xs rounded-xl"
                >
                  Sfoglia Tour
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {favoriteTours.map((tour) => (
                  <div
                    key={tour.id}
                    className="bg-[#0c141d] border border-stone-800 rounded-2xl overflow-hidden p-4 space-y-3 shadow-lg"
                  >
                    <div className="flex gap-3">
                      <img
                        src={tour.coverImage}
                        alt={tour.title}
                        className="w-20 h-20 rounded-xl object-cover shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <span className="text-[10px] text-[#79c3e6] uppercase font-semibold">
                          {tour.city}
                        </span>
                        <h4 className="text-sm font-bold text-white truncate">
                          {tour.title}
                        </h4>
                        <div className="text-xs text-stone-400 mt-1">
                          {tour.estimatedKm} km · {tour.waypointsCount} monumenti
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleStartTour(tour)}
                        className="flex-1 py-2 bg-[#1e5e7f] hover:bg-[#287096] text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Inizia</span>
                      </button>
                      <button
                        onClick={() => setSelectedTourForDetail(tour)}
                        className="py-2 px-3 bg-[#121c27] hover:bg-[#1a293a] text-stone-300 text-xs font-medium rounded-xl border border-stone-700"
                      >
                        Info
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: PASSAPORTO DEL VIAGGIATORE & STATISTICHE */}
        {activeTab === 'passport' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold font-serif text-white">
                  Passaporto del Viaggiatore
                </h2>
                <p className="text-xs text-stone-400">
                  I tuoi traguardi, monumenti sbloccati e sincronizzazione cloud
                </p>
              </div>
              <button
                onClick={() => setShowProfileModal(true)}
                className="px-3 py-1.5 bg-[#121c27] hover:bg-[#1a293a] border border-[#1e5e7f]/40 rounded-xl text-xs font-semibold text-stone-300 hover:text-white"
              >
                Gestisci Account
              </button>
            </div>

            {/* Traveler Passport Card */}
            <div className="bg-gradient-to-br from-[#1e5e7f]/20 via-[#0c141d] to-[#0c141d] border-2 border-[#1e5e7f]/40 rounded-3xl p-6 shadow-2xl space-y-6">
              <div className="flex items-center justify-between border-b border-stone-800 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-2xl bg-[#1e5e7f]/20 border border-[#1e5e7f]/40 flex items-center justify-center text-3xl shadow-inner">
                    🏛️
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white font-serif">
                      {userProfile.name}
                    </h3>
                    <div className="text-xs text-[#79c3e6] font-mono">
                      Codice Sincronizzazione: {userProfile.syncCode}
                    </div>
                  </div>
                </div>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded-full bg-[#1e5e7f] text-white font-mono">
                  {userProfile.subscriptionTier.toUpperCase()}
                </span>
              </div>

              {/* Stats overview */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-[#080d14]/70 border border-stone-800 rounded-2xl p-4 text-center">
                  <span className="text-xs text-stone-400 block mb-1">Km a piedi</span>
                  <span className="text-2xl font-bold font-mono text-[#79c3e6]">
                    {userProfile.totalKmWalked.toFixed(1)}
                  </span>
                </div>
                <div className="bg-[#080d14]/70 border border-stone-800 rounded-2xl p-4 text-center">
                  <span className="text-xs text-stone-400 block mb-1">Monumenti scoperti</span>
                  <span className="text-2xl font-bold font-mono text-[#79c3e6]">
                    {userProfile.monumentsVisited.length}
                  </span>
                </div>
                <div className="bg-[#080d14]/70 border border-stone-800 rounded-2xl p-4 text-center">
                  <span className="text-xs text-stone-400 block mb-1">Ore in cuffia</span>
                  <span className="text-2xl font-bold font-mono text-emerald-400">
                    {userProfile.hoursListened.toFixed(1)}h
                  </span>
                </div>
              </div>

              {/* Unlocked Badges */}
              <div className="space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-stone-400 flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-[#79c3e6]" />
                  <span>Timbri & Onorificenze Sbloccate</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {userProfile.badges.map((b) => (
                    <div
                      key={b.id}
                      className="bg-[#080d14]/50 border border-stone-800 rounded-2xl p-3 flex items-center gap-3"
                    >
                      <span className="text-3xl">{b.icon}</span>
                      <div>
                        <div className="text-xs font-bold text-stone-200">
                          {b.title}
                        </div>
                        <div className="text-[11px] text-stone-400 leading-snug">
                          {b.description}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Persistent Audio Player Dock */}
      <AudioPlayerDock
        waypoint={activeWaypoint}
        narration={activeNarration && activeWaypoint ? withRecordedText(activeWaypoint.id, activeNarration) : activeNarration}
        isPlaying={isPlaying}
        onTogglePlay={handleTogglePlay}
        onSkipBack15={handleSkipBack15}
        onSkipForward15={handleSkipForward15}
        onNextWaypoint={handleNextWaypoint}
        onPrevWaypoint={handlePrevWaypoint}
        playbackProgress={playbackProgress}
        activeVoicePersona={activeVoicePersona}
        onChangeVoicePersona={setActiveVoicePersona}
        playbackSpeed={playbackSpeed}
        onChangePlaybackSpeed={handleChangePlaybackSpeed}
        onOpenVoiceAssistant={() => setShowVoiceAssistant(true)}
        isSavedAsFavorite={
          activeTour ? userProfile.favoriteTourIds.includes(activeTour.id) : false
        }
        onToggleSaveFavorite={() => {
          if (activeTour) handleToggleFavorite(activeTour.id);
        }}
      />

      {/* Bottom Navigation */}
      <BottomNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        favoritesCount={userProfile.favoriteTourIds.length}
      />

      {/* Voice Assistant Modal (Bluetooth Conversational Q&A) */}
      <VoiceAssistantModal
        isOpen={showVoiceAssistant}
        onClose={() => setShowVoiceAssistant(false)}
        currentMonumentName={activeWaypoint?.name || ''}
        city={activeTour.city}
        voicePersona={activeVoicePersona}
        bluetoothState={bluetoothState}
        suggestedQuestions={activeNarration?.suggestedQuestions}
        userLocation={userLocation}
      />

      {/* Bluetooth Earphones Modal */}
      <BluetoothModal
        isOpen={showBluetoothModal}
        onClose={() => setShowBluetoothModal(false)}
        bluetoothState={bluetoothState}
      />

      {/* Subscription Modal (Cicerone Pass Pro) */}
      <SubscriptionModal
        isOpen={showSubscriptionModal}
        onClose={() => setShowSubscriptionModal(false)}
        userProfile={userProfile}
        onUpgradeTier={handleUpgradeTier}
      />

      {/* Profile & Multi-Device Cloud Sync Modal */}
      <ProfileSyncModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        userProfile={userProfile}
        onUpdateProfile={setUserProfile}
        onOpenSubscription={() => {
          setShowProfileModal(false);
          setShowSubscriptionModal(true);
        }}
      />

      {/* Custom AI Tour Generator Modal */}
      <CreateTourModal
        isOpen={showCreateTourModal}
        onClose={() => setShowCreateTourModal(false)}
        onTourCreated={handleCustomTourCreated}
        userLocation={userLocation}
      />

      {/* Tour Detail Modal */}
      <TourDetailModal
        tour={selectedTourForDetail}
        isOpen={!!selectedTourForDetail}
        onClose={() => setSelectedTourForDetail(null)}
        onStartTour={handleStartTour}
        userProfile={userProfile}
        isFavorite={
          selectedTourForDetail
            ? userProfile.favoriteTourIds.includes(selectedTourForDetail.id)
            : false
        }
        onToggleFavorite={handleToggleFavorite}
        onOpenSubscription={() => {
          setSelectedTourForDetail(null);
          setShowSubscriptionModal(true);
        }}
        onTourDownloaded={handleTourDownloaded}
      />
    </div>
  );
}
