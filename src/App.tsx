import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, Settings2, Keyboard, History as HistoryIcon, Volume2, Activity, Clock, Hash, Type } from 'lucide-react';

const MORSE_DICT: Record<string, string> = {
  'A': '.-', 'B': '-...', 'C': '-.-.', 'D': '-..', 'E': '.', 'F': '..-.',
  'G': '--.', 'H': '....', 'I': '..', 'J': '.---', 'K': '-.-', 'L': '.-..',
  'M': '--', 'N': '-.', 'O': '---', 'P': '.--.', 'Q': '--.-', 'R': '.-.',
  'S': '...', 'T': '-', 'U': '..-', 'V': '...-', 'W': '.--', 'X': '-..-',
  'Y': '-.--', 'Z': '--..',
  '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-',
  '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.'
};

const LESSONS = [
  { id: 'baza', name: 'De bază', chars: 'ARZSJYEQTPIB' },
  { id: 'custom', name: 'Custom chars', chars: 'ABCDE' },
  { id: 'numbers', name: 'Numbers', chars: '1234567890' },
  { id: 'all', name: 'All Letters', chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' }
];

type HistoryEntry = {
  id: string;
  date: string;
  playedText: string;
  transcription?: string;
  score?: number;
  maxScore?: number;
  isTranscriptionMode: boolean;
};

class MorsePlayer {
  audioCtx: AudioContext | null = null;
  isPlaying = false;
  activeOscillator: OscillatorNode | null = null;
  timeoutId: number | null = null;
  resolveDelay: (() => void) | null = null;

  init() {
    if (!this.audioCtx) {
      this.audioCtx = new AudioContext();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  async playTone(durationMs: number, freq: number, vol: number) {
    if (!this.isPlaying || !this.audioCtx) return;

    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    this.activeOscillator = osc;

    osc.type = 'sine';
    osc.frequency.value = freq;

    const now = this.audioCtx.currentTime;
    const durationSec = durationMs / 1000;

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.005);
    gain.gain.setValueAtTime(vol, now + durationSec - 0.005);
    gain.gain.linearRampToValueAtTime(0, now + durationSec);

    osc.connect(gain);
    gain.connect(this.audioCtx.destination);

    osc.start(now);
    osc.stop(now + durationSec);

    return new Promise<void>(resolve => {
      this.resolveDelay = resolve;
      this.timeoutId = window.setTimeout(() => {
        this.resolveDelay = null;
        this.timeoutId = null;
        this.activeOscillator = null;
        resolve();
      }, durationMs);
    });
  }

  async delay(ms: number) {
    if (!this.isPlaying) return;
    return new Promise<void>(resolve => {
      this.resolveDelay = resolve;
      this.timeoutId = window.setTimeout(() => {
        this.resolveDelay = null;
        this.timeoutId = null;
        resolve();
      }, ms);
    });
  }

  stop() {
    this.isPlaying = false;
    if (this.activeOscillator && this.audioCtx) {
      try {
        this.activeOscillator.stop();
      } catch (e) {}
      this.activeOscillator = null;
    }
    if (this.timeoutId !== null) {
      window.clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    if (this.resolveDelay) {
      this.resolveDelay();
      this.resolveDelay = null;
    }
  }
}

export default function App() {
  const [settings, setSettings] = useState({
    numChars: 120,
    wpm: 18,
    frequency: 700,
    volume: 0.5,
    charSpacing: 15,
    wordSpacing: 15,
    groupSize: 4,
    lesson: 'baza',
    customChars: 'ARZSJYEQTPIB',
    preStartText: 'VVVV',
    showCurrentChar: true,
    transcriptionMode: false
  });

  const [isPlaying, setIsPlaying] = useState(false);
  const [playedText, setPlayedText] = useState('');
  const [userTranscription, setUserTranscription] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const playerRef = useRef(new MorsePlayer());
  const settingsRef = useRef(settings);
  const userTranscriptionRef = useRef(userTranscription);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    userTranscriptionRef.current = userTranscription;
  }, [userTranscription]);

  useEffect(() => {
    const saved = localStorage.getItem('morseHistory');
    if (saved) {
      try {
        setHistory(JSON.parse(saved) as HistoryEntry[]);
      } catch (e) {}
    }
  }, []);

  const saveToHistory = (played: string, transcribed: string) => {
    if (!played.trim()) return;

    const currentSettings = settingsRef.current;
    const newEntry: HistoryEntry = {
      id: Date.now().toString(),
      date: new Date().toLocaleString(),
      playedText: played,
      isTranscriptionMode: currentSettings.transcriptionMode,
    };

    if (currentSettings.transcriptionMode) {
      newEntry.transcription = transcribed;
      const pStr = played.replace(/\s/g, '');
      const tStr = transcribed.replace(/\s/g, '');
      let score = 0;
      const maxScore = pStr.length;
      for (let i = 0; i < maxScore; i++) {
        if (pStr[i] === tStr[i]) score++;
      }
      newEntry.score = score;
      newEntry.maxScore = maxScore;
    }

    setHistory(prev => {
      const updated = [newEntry, ...prev];
      localStorage.setItem('morseHistory', JSON.stringify(updated));
      return updated;
    });
  };

  const playMorse = async () => {
    playerRef.current.init();
    playerRef.current.isPlaying = true;
    setIsPlaying(true);
    setPlayedText('');
    setUserTranscription('');

    const currentSettings = settingsRef.current;
    
    const dotMs = 1200 / currentSettings.wpm;
    const dashMs = dotMs * 3;
    const intraCharMs = dotMs;
    const interCharMs = dotMs * currentSettings.charSpacing;
    const interWordMs = dotMs * currentSettings.wordSpacing;

    // Play pre-start text
    if (currentSettings.preStartText) {
      for (const char of currentSettings.preStartText.toUpperCase()) {
        if (!playerRef.current.isPlaying) break;
        if (char === ' ') {
          await playerRef.current.delay(interWordMs);
          continue;
        }
        const morse = MORSE_DICT[char];
        if (morse) {
          for (let i = 0; i < morse.length; i++) {
            if (!playerRef.current.isPlaying) break;
            const symbol = morse[i];
            if (symbol === '.') await playerRef.current.playTone(dotMs, currentSettings.frequency, currentSettings.volume);
            else if (symbol === '-') await playerRef.current.playTone(dashMs, currentSettings.frequency, currentSettings.volume);
            
            if (i < morse.length - 1) await playerRef.current.delay(intraCharMs);
          }
          await playerRef.current.delay(interCharMs);
        }
      }
      await playerRef.current.delay(interWordMs);
    }

    // Generate target text
    const availableChars: string[] = Array.from(new Set(currentSettings.customChars.toUpperCase().replace(/[^A-Z0-9]/g, '')));
    if (availableChars.length === 0) availableChars.push('A');

    let target = '';
    let charCount = 0;
    while (charCount < currentSettings.numChars) {
      const randomChar = availableChars[Math.floor(Math.random() * availableChars.length)];
      target += randomChar;
      charCount++;
      if (currentSettings.groupSize > 0 && charCount % currentSettings.groupSize === 0 && charCount < currentSettings.numChars) {
        target += ' ';
      }
    }

    // Play target text
    let currentPlayed = '';
    for (const char of target) {
      if (!playerRef.current.isPlaying) break;
      
      if (char === ' ') {
        currentPlayed += ' ';
        setPlayedText(currentPlayed);
        await playerRef.current.delay(interWordMs);
        continue;
      }

      const morse = MORSE_DICT[char];
      if (morse) {
        for (let i = 0; i < morse.length; i++) {
          if (!playerRef.current.isPlaying) break;
          const symbol = morse[i];
          if (symbol === '.') await playerRef.current.playTone(dotMs, currentSettings.frequency, currentSettings.volume);
          else if (symbol === '-') await playerRef.current.playTone(dashMs, currentSettings.frequency, currentSettings.volume);
          
          if (i < morse.length - 1) await playerRef.current.delay(intraCharMs);
        }
        
        if (!playerRef.current.isPlaying) break;
        currentPlayed += char;
        setPlayedText(currentPlayed);
        await playerRef.current.delay(interCharMs);
      }
    }

    playerRef.current.isPlaying = false;
    setIsPlaying(false);
    saveToHistory(currentPlayed, userTranscriptionRef.current);
  };

  const stopMorse = () => {
    playerRef.current.stop();
  };

  const handleTranscriptionInput = (char: string) => {
    setUserTranscription(prev => prev + char);
  };

  const handleTranscriptionBackspace = () => {
    setUserTranscription(prev => prev.slice(0, -1));
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
        return;
      }
      
      if (!isPlaying || !settings.transcriptionMode) return;
      
      const key = e.key.toUpperCase();
      const availableChars: string[] = Array.from(new Set(settings.customChars.toUpperCase().replace(/[^A-Z0-9]/g, '')));
      
      if (availableChars.includes(key) || key === ' ') {
        e.preventDefault();
        handleTranscriptionInput(key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleTranscriptionBackspace();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, settings.transcriptionMode, settings.customChars]);

  const handleLessonChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const lessonId = e.target.value;
    const lesson = LESSONS.find(l => l.id === lessonId);
    setSettings(prev => ({
      ...prev,
      lesson: lessonId,
      customChars: lesson?.chars || prev.customChars
    }));
  };

  const renderColoredTranscription = (played: string, transcribed: string) => {
    const tStr = transcribed.replace(/\s/g, '');
    let tIdx = 0;
    
    const result = [];
    
    for (let i = 0; i < played.length; i++) {
      const p = played[i];
      if (p === ' ') {
        result.push(<span key={`space-${i}`}> </span>);
        continue;
      }
      
      const t = tStr[tIdx];
      if (p === t) {
        result.push(<span key={i} className="text-green-600 dark:text-green-400 font-bold">{t}</span>);
      } else {
        if (t === undefined) {
          result.push(<span key={i} className="text-red-500 dark:text-red-400 font-bold opacity-50">_</span>);
        } else {
          result.push(<span key={i} className="text-red-600 dark:text-red-400 font-bold">{t}</span>);
        }
      }
      tIdx++;
    }
    
    while (tIdx < tStr.length) {
      result.push(<span key={`extra-${tIdx}`} className="text-red-600 dark:text-red-400 font-bold line-through">{tStr[tIdx]}</span>);
      tIdx++;
    }
    
    return result;
  };

  const availableChars: string[] = Array.from(new Set(settings.customChars.toUpperCase().replace(/[^A-Z0-9]/g, '')));

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-4 md:p-8 font-sans">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Settings */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center gap-2 mb-6 border-b border-gray-100 dark:border-gray-700 pb-4">
              <Settings2 className="w-5 h-5 text-indigo-500" />
              <h2 className="text-lg font-semibold">Configuration</h2>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <label className="flex flex-col">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1"><Hash className="w-4 h-4"/> Number of Characters</span>
                <input type="number" value={settings.numChars} onChange={e => setSettings({...settings, numChars: Number(e.target.value)})} className="mt-1 p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 focus:ring-2 focus:ring-indigo-500 outline-none" />
              </label>
              <label className="flex flex-col">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1"><Activity className="w-4 h-4"/> Speed (WPM)</span>
                <input type="number" value={settings.wpm} onChange={e => setSettings({...settings, wpm: Number(e.target.value)})} className="mt-1 p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 focus:ring-2 focus:ring-indigo-500 outline-none" />
              </label>
              <label className="flex flex-col">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1"><Activity className="w-4 h-4"/> Frequency (Hz)</span>
                <input type="number" value={settings.frequency} onChange={e => setSettings({...settings, frequency: Number(e.target.value)})} className="mt-1 p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 focus:ring-2 focus:ring-indigo-500 outline-none" />
              </label>
              <label className="flex flex-col">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1"><Volume2 className="w-4 h-4"/> Volume ({settings.volume})</span>
                <input type="range" min="0" max="1" step="0.1" value={settings.volume} onChange={e => setSettings({...settings, volume: Number(e.target.value)})} className="mt-3 accent-indigo-500" />
              </label>
              <label className="flex flex-col">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1"><Clock className="w-4 h-4"/> Character Spacing (dots)</span>
                <input type="number" value={settings.charSpacing} onChange={e => setSettings({...settings, charSpacing: Number(e.target.value)})} className="mt-1 p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 focus:ring-2 focus:ring-indigo-500 outline-none" />
              </label>
              <label className="flex flex-col">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1"><Clock className="w-4 h-4"/> Word Spacing (dots)</span>
                <input type="number" value={settings.wordSpacing} onChange={e => setSettings({...settings, wordSpacing: Number(e.target.value)})} className="mt-1 p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 focus:ring-2 focus:ring-indigo-500 outline-none" />
              </label>
              <label className="flex flex-col">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1"><Hash className="w-4 h-4"/> Group Size</span>
                <input type="number" value={settings.groupSize} onChange={e => setSettings({...settings, groupSize: Number(e.target.value)})} className="mt-1 p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 focus:ring-2 focus:ring-indigo-500 outline-none" />
              </label>
              <label className="flex flex-col">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1"><Type className="w-4 h-4"/> Pre-start Text</span>
                <input type="text" value={settings.preStartText} onChange={e => setSettings({...settings, preStartText: e.target.value})} className="mt-1 p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 focus:ring-2 focus:ring-indigo-500 outline-none" />
              </label>
            </div>

            <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-700">
              <label className="flex flex-col mb-4">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Lesson</span>
                <select value={settings.lesson} onChange={handleLessonChange} className="p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 focus:ring-2 focus:ring-indigo-500 outline-none">
                  {LESSONS.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </label>
              
              <label className="flex flex-col">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Custom Chars</span>
                <input type="text" value={settings.customChars} onChange={e => setSettings({...settings, customChars: e.target.value, lesson: 'custom'})} className="p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 focus:ring-2 focus:ring-indigo-500 outline-none uppercase" />
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-2 font-mono">
                  Using: {availableChars.join('')}
                </div>
              </label>
            </div>

            <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-700 space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={settings.showCurrentChar} onChange={e => setSettings({...settings, showCurrentChar: e.target.checked})} className="w-5 h-5 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500" />
                <span className="text-sm font-medium">Show current character</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={settings.transcriptionMode} onChange={e => setSettings({...settings, transcriptionMode: e.target.checked})} className="w-5 h-5 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500" />
                <span className="text-sm font-medium">Transcription Mode</span>
              </label>
            </div>
          </div>
        </div>

        {/* Right Column: Player & History */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex gap-4">
              {!isPlaying ? (
                <button onClick={playMorse} className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-4 rounded-xl font-bold text-lg transition-colors shadow-sm">
                  <Play className="w-6 h-6" /> Start
                </button>
              ) : (
                <button onClick={stopMorse} className="flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white py-4 rounded-xl font-bold text-lg transition-colors shadow-sm">
                  <Square className="w-6 h-6" /> Stop
                </button>
              )}
            </div>

            {settings.transcriptionMode ? (
              <div className="mt-8">
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2"><Keyboard className="w-5 h-5 text-indigo-500"/> Transcription</h3>
                <div className="p-6 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl min-h-[120px] font-mono text-2xl tracking-widest break-all shadow-inner">
                  {userTranscription || <span className="text-gray-400 dark:text-gray-600">Type here...</span>}
                </div>
                
                <div className="flex flex-wrap gap-2 mt-6">
                  {availableChars.map(char => (
                    <button
                      key={char}
                      onClick={() => handleTranscriptionInput(char)}
                      disabled={!isPlaying}
                      className="w-12 h-12 flex items-center justify-center text-lg font-mono font-bold bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl shadow-sm hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
                    >
                      {char}
                    </button>
                  ))}
                  <button
                    onClick={() => handleTranscriptionInput(' ')}
                    disabled={!isPlaying}
                    className="px-6 h-12 flex items-center justify-center text-sm font-bold bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl shadow-sm hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
                  >
                    SPACE
                  </button>
                  <button
                    onClick={() => handleTranscriptionBackspace()}
                    disabled={!isPlaying}
                    className="px-6 h-12 flex items-center justify-center text-sm font-bold bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/50 rounded-xl shadow-sm hover:bg-red-100 dark:hover:bg-red-900/40 disabled:opacity-50 transition-colors"
                  >
                    DEL
                  </button>
                </div>
              </div>
            ) : (
              settings.showCurrentChar && (
                <div className="mt-8">
                  <h3 className="text-lg font-semibold mb-3">Displayed Text</h3>
                  <div className="p-6 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl min-h-[120px] font-mono text-2xl tracking-widest break-all shadow-inner">
                    {playedText}
                  </div>
                </div>
              )
            )}
          </div>

          {history.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center gap-2 mb-6 border-b border-gray-100 dark:border-gray-700 pb-4">
                <HistoryIcon className="w-5 h-5 text-indigo-500" />
                <h3 className="text-xl font-bold">History ({history.length})</h3>
              </div>
              <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                {history.map(entry => (
                  <div key={entry.id} className="p-5 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700">
                    <div className="flex justify-between items-center mb-3 text-sm text-gray-500 dark:text-gray-400">
                      <span>{entry.date}</span>
                      {entry.isTranscriptionMode && entry.score !== undefined && (
                        <span className="font-semibold text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 px-3 py-1 rounded-full border border-gray-200 dark:border-gray-700">
                          Score: {entry.score}/{entry.maxScore}
                        </span>
                      )}
                    </div>
                    <div className="font-mono text-xl tracking-widest break-all">
                      {entry.isTranscriptionMode && entry.transcription !== undefined ? (
                        renderColoredTranscription(entry.playedText, entry.transcription)
                      ) : (
                        entry.playedText
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
