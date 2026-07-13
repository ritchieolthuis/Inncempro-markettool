import React, { useRef, useState } from 'react';
import { Mic, MicOff } from 'lucide-react';

interface VoiceInputButtonProps {
  onResult: (text: string) => void;
  className?: string;
  lang?: string;
}

// Kleine, overal herbruikbare microfoonknop voor tekstvelden. Gebruikt de ingebouwde
// spraakherkenning van de browser (Web Speech API) — geen extra kosten of eigen server nodig,
// werkt in Chrome/Edge en Safari op iOS/Android. Op browsers zonder ondersteuning rendert de
// knop niets, zodat er geen dode knop verschijnt.
const VoiceInputButton: React.FC<VoiceInputButtonProps> = ({ onResult, className, lang = 'nl-NL' }) => {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const SpeechRecognitionCtor: any =
    typeof window !== 'undefined' ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) : null;

  if (!SpeechRecognitionCtor) return null;

  const stopListening = () => {
    try { recognitionRef.current?.stop(); } catch { /* al gestopt */ }
    setListening(false);
  };

  const startListening = () => {
    const recognition = new SpeechRecognitionCtor();
    recognition.lang = lang;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (e: any) => {
      const transcript = e.results?.[0]?.[0]?.transcript?.trim();
      if (transcript) onResult(transcript);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  };

  return (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); listening ? stopListening() : startListening(); }}
      title={listening ? 'Stop met luisteren' : 'Spreek in'}
      className={className || `flex-shrink-0 p-1.5 rounded-full transition-colors ${listening ? 'text-red-500 bg-red-50 animate-pulse' : 'text-slate-400 hover:text-[#009FE3] hover:bg-[#009FE3]/10'}`}
    >
      {listening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
    </button>
  );
};

export default VoiceInputButton;
