import React, { useRef, useState } from 'react';
import { Mic, MicOff } from 'lucide-react';

interface VoiceInputButtonProps {
  onResult: (text: string) => void;
  className?: string;
  lang?: string;
}

// Kleine, overal herbruikbare microfoonknop voor tekstvelden. Gebruikt de ingebouwde
// spraakherkenning van de browser (Web Speech API) — geen extra kosten of eigen server nodig.
// Werkt in Chrome/Edge (desktop en Android). Safari (ook op iOS/iPhone) ondersteunt deze
// browser-API niet — Apple heeft 'm nooit ingebouwd in WebKit, dus daar verschijnt de knop
// bewust niet (geen dode knop tonen die toch nooit iets doet).
const VoiceInputButton: React.FC<VoiceInputButtonProps> = ({ onResult, className, lang = 'nl-NL' }) => {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  const SpeechRecognitionCtor: any =
    typeof window !== 'undefined' ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) : null;

  if (!SpeechRecognitionCtor) return null;

  const stopListening = () => {
    try { recognitionRef.current?.stop(); } catch { /* al gestopt */ }
    setListening(false);
  };

  const startListening = () => {
    setError(null);
    // Zonder beveiligde context (https, of localhost) start de browser de microfoon
    // helemaal niet — expliciet checken zodat we dat kunnen tonen i.p.v. dat er stilletjes
    // niets gebeurt (dit was precies de oorzaak toen er via een lokaal netwerk-IP over http
    // werd getest in plaats van via https of localhost).
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      setError('Microfoon werkt alleen via https (of localhost).');
      return;
    }
    let recognition: any;
    try {
      recognition = new SpeechRecognitionCtor();
    } catch {
      setError('Spraakherkenning kon niet starten.');
      return;
    }
    recognition.lang = lang;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (e: any) => {
      const transcript = e.results?.[0]?.[0]?.transcript?.trim();
      if (transcript) onResult(transcript);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = (e: any) => {
      setListening(false);
      if (e?.error === 'not-allowed' || e?.error === 'service-not-allowed') {
        setError('Microfoontoegang geweigerd. Sta dit toe bij de site-instellingen van je browser.');
      } else if (e?.error === 'no-speech') {
        setError('Niets gehoord, probeer opnieuw.');
      } else if (e?.error === 'audio-capture') {
        setError('Geen microfoon gevonden.');
      } else {
        setError('Spraakherkenning ging mis, probeer opnieuw.');
      }
    };
    recognitionRef.current = recognition;
    try {
      setListening(true);
      recognition.start();
    } catch {
      // InvalidStateError etc. — een vorige sessie stond nog "aan" in de browser zelf.
      setListening(false);
      setError('Probeer het nog eens.');
    }
  };

  return (
    <div className="relative inline-flex">
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); listening ? stopListening() : startListening(); }}
        title={listening ? 'Stop met luisteren' : 'Spreek in'}
        className={className || `flex-shrink-0 p-1.5 rounded-full transition-colors ${listening ? 'text-red-500 bg-red-50 animate-pulse' : 'text-slate-400 hover:text-[#009FE3] hover:bg-[#009FE3]/10'}`}
      >
        {listening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
      </button>
      {error && (
        <div className="absolute top-full right-0 mt-1 z-50 w-48 text-[10px] leading-snug bg-slate-900 text-white px-2 py-1.5 rounded-sm shadow-lg">
          {error}
        </div>
      )}
    </div>
  );
};

export default VoiceInputButton;
