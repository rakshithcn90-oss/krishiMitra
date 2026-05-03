import React, { useState, useEffect, useRef } from "react";
import { 
  Camera, 
  Mic, 
  MicOff, 
  Leaf, 
  CloudSun, 
  History, 
  AlertCircle, 
  CheckCircle2, 
  ArrowRight,
  Upload,
  Loader2,
  Trash2,
  Volume2
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { analyzeCrop } from "./lib/gemini.ts";
import { UI_TRANSLATIONS } from "./translations.ts";

interface Weather {
  temp: number;
  humidity: number;
  condition: string;
  city: string;
}

interface AnalysisResult {
  diagnosis: string;
  explanation: string;
  steps: string[];
  treatment: {
    product: string;
    timing: string;
    prevention: string;
  };
  urgency: "High" | "Medium" | "Low";
  confidence: number;
}

interface HistoryEntry {
  id: number;
  timestamp: string;
  crop: string;
  location: string;
  transcript: string;
  analysis: AnalysisResult;
}

const FALLBACK_ADVICE: Record<string, string> = {
  "yellow leaves": "Possible nutrient deficiency (Nitrogen). Consider adding organic manure or urea.",
  "holes in leaves": "Possible pest attack. Try spraying diluted neem oil or consult a local expert.",
  "brown spots": "Could be fungal. Ensure proper drainage and avoid overhead watering in the evening.",
};

export default function App() {
  const [crop, setCrop] = useState("Paddy (Rice)");
  const [location, setLocation] = useState("Shimoga");
  const [language, setLanguage] = useState(() => localStorage.getItem("km_pref_lang") || "English");
  const [transcript, setTranscript] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const LANG_MAP: Record<string, string> = {
    "English": "en-IN",
    "Kannada": "kn-IN",
    "Hindi": "hi-IN",
    "Telugu": "te-IN",
    "Tamil": "ta-IN",
    "Marathi": "mr-IN",
    "Bengali": "bn-IN"
  };

  useEffect(() => {
    fetchWeather();
    fetchHistory();
  }, []);

  useEffect(() => {
    localStorage.setItem("km_pref_lang", language);
  }, [language]);

  const toggleRecording = async () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        await uploadAudio(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Failed to start recording:", err);
      alert("Please allow microphone access to use voice features.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const fetchWeather = async () => {
    try {
      const res = await fetch(`/api/weather?city=${location}`);
      const data = await res.json();
      setWeather(data);
    } catch (err) {
      console.error("Weather fetch failed", err);
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await fetch("/api/history");
      const data = await res.json();
      setHistory(data);
    } catch (err) {
      console.error("History fetch failed", err);
    }
  };

  const uploadAudio = async (blob: Blob) => {
    const formData = new FormData();
    formData.append("audio", blob, "recording.webm");

    try {
      setTranscript("Processing voice...");
      const res = await fetch("/api/speech-to-text", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.transcript) {
        setTranscript(data.transcript);
      } else {
        setTranscript("Couldn't hear you clearly. Please try again.");
      }
    } catch (err) {
      console.error("Upload failed:", err);
      setTranscript("Error processing voice.");
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const runAnalysis = async () => {
    if (!transcript.trim() && !image) {
      alert("Please provide a voice description or an image.");
      return;
    }

    setIsAnalyzing(true);
    setResult(null);

    try {
      let mimeType = "";
      let base64 = "";
      if (image) {
        mimeType = image.split(";")[0].split(":")[1];
        base64 = image.split(",")[1];
      }

      const analysis = await analyzeCrop(transcript, crop, location, weather, language, base64, mimeType);
      
      if (analysis.error) {
        // Fallback strategy
        const keyword = Object.keys(FALLBACK_ADVICE).find(k => transcript.toLowerCase().includes(k));
        setResult({
          diagnosis: "Limited Offline Diagnosis",
          explanation: keyword ? FALLBACK_ADVICE[keyword] : "Check for water stress or pests. Our AI is currently unavailable for full analysis.",
          steps: ["Check soil moisture", "Look for pests under leaves"],
          treatment: { product: "Natural fertilizers", timing: "Early morning", prevention: "Regular crop rotation" },
          urgency: "Medium",
          confidence: 40
        });
      } else {
        setResult(analysis);
        // Save to history
        await fetch("/api/history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ crop, location, transcript, analysis })
        });
        fetchHistory();
      }
    } catch (err) {
      console.error("Analysis failed", err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const speakResult = () => {
    if (!result) return;
    const msg = new SpeechSynthesisUtterance();
    msg.text = `Diagnosis: ${result.diagnosis}. ${result.explanation}. Steps: ${result.steps.join(". ")}. Recommendation: Use ${result.treatment.product} in the ${result.treatment.timing}.`;
    msg.lang = LANG_MAP[language];
    window.speechSynthesis.speak(msg);
  };

  const t = (key: string) => (UI_TRANSLATIONS[language] || UI_TRANSLATIONS["English"])[key] || UI_TRANSLATIONS["English"][key];

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1b271b] via-[#2d4d2d] to-[#1b271b] text-white font-sans overflow-x-hidden p-4 md:p-6 flex flex-col gap-6">
      {/* Glow Effects */}
      <div className="fixed -top-24 -left-24 w-96 h-96 bg-emerald-500/10 rounded-full blur-[100px] pointer-events-none"></div>
      <div className="fixed -bottom-24 -right-24 w-96 h-96 bg-emerald-500/10 rounded-full blur-[100px] pointer-events-none"></div>

      {/* Header */}
      <header className="flex justify-between items-center bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl px-6 py-4 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Leaf className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tighter uppercase flex items-center gap-1">
            {t("title")} <span className="text-emerald-400 font-light">AI</span>
          </h1>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-3 bg-white/5 px-4 py-2 rounded-full border border-white/10">
            <CloudSun className="w-5 h-5 text-yellow-400" />
            <div className="text-sm">
              <p className="font-medium">{weather ? `${Math.round(weather.temp)}°C / ${weather.city}` : "---°C"}</p>
              <p className="text-white/50 text-[10px] uppercase tracking-wider">{weather ? `${weather.humidity}% ${t("humidity")} • ${weather.condition}` : "..."}</p>
            </div>
          </div>
          <button 
            onClick={() => setShowHistory(true)}
            className="w-10 h-10 rounded-full bg-white/10 border border-white/20 flex items-center justify-center hover:bg-white/20 transition-all"
          >
            <History className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 grid grid-cols-12 gap-6 pb-24">
        
        {/* LEFT COLUMN: Controls & Weather */}
        <aside className="col-span-12 lg:col-span-3 flex flex-col gap-6 order-2 lg:order-1">
          <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-5 flex flex-col gap-4">
            <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-400">{t("settings")}</h2>
            <div className="flex flex-col md:flex-row gap-2">
              <div className="flex-1">
                <p className="text-[10px] text-white/40 uppercase mb-1">{t("crop")}</p>
                <select 
                  value={crop} 
                  onChange={(e) => setCrop(e.target.value)}
                  className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 outline-none focus:ring-1 focus:ring-emerald-500 transition-all text-sm"
                >
                  <option className="bg-stone-900">Paddy (Rice)</option>
                  <option className="bg-stone-900">Wheat</option>
                  <option className="bg-stone-900">Corn (Maize)</option>
                  <option className="bg-stone-900">Ragi (Finger Millet)</option>
                  <option className="bg-stone-900">Jowar (Sorghum)</option>
                  <option className="bg-stone-900">Bajra (Pearl Millet)</option>
                  <option className="bg-stone-900">Cotton</option>
                  <option className="bg-stone-900">Sugarcane</option>
                  <option className="bg-stone-900">Groundnut</option>
                  <option className="bg-stone-900">Soybean</option>
                  <option className="bg-stone-900">Turmeric</option>
                  <option className="bg-stone-900">Ginger</option>
                  <option className="bg-stone-900">Areca Nut</option>
                  <option className="bg-stone-900">Coffee</option>
                  <option className="bg-stone-900">Banana</option>
                  <option className="bg-stone-900">Mango</option>
                  <option className="bg-stone-900">Tomato</option>
                  <option className="bg-stone-900">Chilli</option>
                  <option className="bg-stone-900">Onion</option>
                  <option className="bg-stone-900">Potato</option>
                </select>
              </div>
              <div className="flex-1">
                <p className="text-[10px] text-white/40 uppercase mb-1">{t("language")}</p>
                <select 
                  value={language} 
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 outline-none focus:ring-1 focus:ring-emerald-500 transition-all text-sm"
                >
                  <option className="bg-stone-900">English</option>
                  <option className="bg-stone-900">Kannada</option>
                  <option className="bg-stone-900">Hindi</option>
                  <option className="bg-stone-900">Telugu</option>
                  <option className="bg-stone-900">Tamil</option>
                  <option className="bg-stone-900">Marathi</option>
                  <option className="bg-stone-900">Bengali</option>
                </select>
              </div>
            </div>
            <div>
              <p className="text-[10px] text-white/40 uppercase mb-1 tracking-widest block">{t("location")}</p>
                <input 
                  type="text" 
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  onBlur={fetchWeather}
                  className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 outline-none focus:ring-1 focus:ring-emerald-500 transition-all text-sm"
                  placeholder="City/Village"
                />
              </div>
          </div>

          <div className="bg-emerald-900/30 backdrop-blur-md border border-emerald-500/20 rounded-2xl p-4 flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full animate-pulse ${isAnalyzing ? "bg-amber-400" : "bg-emerald-400"}`}></div>
            <p className="text-[10px] font-bold tracking-widest text-emerald-300 uppercase">
              {isAnalyzing ? t("systemStatusAnalyzing") : t("systemStatusActive")}
            </p>
          </div>

          {/* Quick Stats (Static in Design, Dynamic here if needed) */}
          <div className="bg-black/30 backdrop-blur-md border border-white/5 rounded-2xl p-6 hidden lg:flex flex-col gap-4">
             <div>
              <span className="text-[10px] text-white/40 block uppercase tracking-widest">{t("totalScansSaved")}</span>
              <span className="font-mono text-xl">{history.length}</span>
            </div>
             <div className="pt-4 border-t border-white/5">
              <span className="text-[10px] text-white/40 block uppercase tracking-widest">{t("globalStatus")}</span>
              <span className="text-xs text-emerald-400 font-medium">{t("synced")}</span>
            </div>
          </div>
        </aside>

        {/* CENTER COLUMN: Analysis Result */}
        <main className="col-span-12 lg:col-span-6 flex flex-col gap-6 order-1 lg:order-2">
          <AnimatePresence mode="wait">
            {!result && !isAnalyzing ? (
              <motion.div 
                key="welcome"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex-1 bg-white/10 backdrop-blur-2xl border border-white/20 rounded-3xl p-8 flex flex-col items-center justify-center text-center space-y-4"
              >
                <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center border border-emerald-500/30">
                  <Leaf className="w-10 h-10 text-emerald-400" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-3xl font-bold tracking-tight">{t("ready")}</h2>
                  <p className="text-white/60 max-w-sm mx-auto">{t("readyDesc")}</p>
                </div>
              </motion.div>
            ) : isAnalyzing ? (
              <motion.div 
                key="analyzing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex-1 bg-white/10 backdrop-blur-2xl border border-white/20 rounded-3xl p-8 flex flex-col items-center justify-center text-center"
              >
                <div className="relative">
                  <div className="w-24 h-24 border-4 border-white/10 border-t-emerald-500 rounded-full animate-spin"></div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-emerald-500 animate-pulse" />
                  </div>
                </div>
                <h2 className="text-xl font-bold mt-6 tracking-widest">{t("analyzing")}</h2>
                <p className="text-emerald-400/70 text-xs font-mono uppercase mt-2">{t("power")}</p>
              </motion.div>
            ) : (
              <motion.div 
                key="result"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex-1 bg-white/10 backdrop-blur-2xl border border-white/30 rounded-3xl p-8 relative overflow-hidden flex flex-col"
              >
                {/* Glass Glow Effect */}
                <div className="absolute -top-24 -right-24 w-64 h-64 bg-emerald-500/20 rounded-full blur-[80px]"></div>

                <div className="flex justify-between items-start mb-8 z-10">
                  <div className="flex-1">
                    <span className={`border px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase
                      ${result.urgency === "High" ? "bg-red-500/20 text-red-400 border-red-500/30" : result.urgency === "Medium" ? "bg-amber-500/20 text-amber-400 border-amber-500/30" : "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"}`}>
                      {t("urgency")}: {result.urgency}
                    </span>
                    <h2 className="text-3xl md:text-4xl font-light mt-4 tracking-tight leading-tight uppercase">
                      {result.diagnosis}
                    </h2>
                    <p className="text-white/60 mt-2">{t("crop")}: <span className="text-emerald-400">{crop}</span></p>
                  </div>
                  <div className="text-right hidden md:block">
                    <p className="text-[10px] text-white/40 uppercase tracking-widest mb-1">{t("confidence")}</p>
                    <p className="text-3xl font-mono text-emerald-400">{result.confidence}%</p>
                  </div>
                  <button 
                    onClick={speakResult}
                    className="md:hidden p-3 bg-white/10 rounded-xl hover:bg-white/20 transition-all ml-4"
                  >
                    <Volume2 className="w-5 h-5 text-emerald-400" />
                  </button>
                </div>

                <div className="space-y-6 flex-1 z-10">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-black/40 p-5 rounded-2xl border border-white/10 space-y-2">
                       <p className="text-[10px] text-emerald-400 uppercase font-bold tracking-widest">{t("expertAnalysis")}</p>
                       <p className="text-sm leading-relaxed text-white/90">{result.explanation}</p>
                    </div>
                    <div className="bg-black/40 p-5 rounded-2xl border border-white/10 space-y-2">
                       <p className="text-[10px] text-emerald-400 uppercase font-bold tracking-widest">{t("environment")}</p>
                       <p className="text-sm leading-relaxed text-white/90">
                         {weather 
                           ? `${weather.condition}. ${t("humidity")} ${weather.humidity}%.` 
                           : t("allSystems")}
                       </p>
                    </div>
                  </div>

                  <div className="bg-emerald-500/10 p-6 rounded-2xl border border-emerald-500/20">
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-[10px] text-emerald-400 uppercase font-bold tracking-widest">{t("steps")}</p>
                      <button 
                        onClick={speakResult}
                        className="hidden md:flex items-center gap-2 text-xs font-bold text-white/50 hover:text-white transition-colors uppercase tracking-widest"
                      >
                        <Volume2 className="w-4 h-4" /> {t("hear")}
                      </button>
                    </div>
                    <ul className="text-sm space-y-4">
                      {result.steps.map((step, i) => (
                        <li key={i} className="flex items-start gap-4 group">
                          <span className="w-6 h-6 bg-emerald-500 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold shadow-lg shadow-emerald-500/20">
                            {i + 1}
                          </span>
                          <span className="text-white/80 group-hover:text-white transition-colors">{step}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-emerald-950/40 p-4 rounded-xl border border-emerald-500/20">
                       <p className="text-[9px] text-emerald-400 uppercase font-bold tracking-tighter mb-1">{t("product")}</p>
                       <p className="text-xs font-medium text-white/90">{result.treatment.product}</p>
                    </div>
                    <div className="bg-emerald-950/40 p-4 rounded-xl border border-emerald-500/20">
                       <p className="text-[9px] text-emerald-400 uppercase font-bold tracking-tighter mb-1">{t("timing")}</p>
                       <p className="text-xs font-medium text-white/90">{result.treatment.timing} • {result.treatment.prevention}</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* RIGHT COLUMN: Multimodal Inputs */}
        <section className="col-span-12 lg:col-span-3 flex flex-col gap-6 order-3">
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="aspect-square bg-black/40 rounded-3xl border border-white/10 overflow-hidden relative group cursor-pointer"
          >
            {image ? (
              <>
                <img src={image} alt="Upload" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent z-10 transition-opacity group-hover:opacity-60"></div>
                {/* Scanner Line */}
                {!result && !isAnalyzing && (
                  <motion.div 
                    initial={{ top: "0%" }}
                    animate={{ top: "100%" }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    className="absolute left-0 w-full h-[2px] bg-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.8)] z-20"
                  ></motion.div>
                )}
                <div className="absolute bottom-4 left-4 z-20 flex items-center gap-2">
                  <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
                  <p className="text-[10px] font-bold text-white uppercase tracking-widest">{t("scanning")}</p>
                </div>
              </>
            ) : (
               <div className="w-full h-full flex flex-col items-center justify-center text-white/20 hover:text-emerald-400/20 transition-all">
                <Camera className="w-20 h-20 mb-2" strokeWidth={1} />
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-40 group-hover:opacity-100 transition-opacity">{t("capture")}</p>
               </div>
            )}
            <input type="file" ref={fileInputRef} onChange={handleImageUpload} className="hidden" accept="image/*" />
          </div>

          <div className="flex-1 bg-white/10 backdrop-blur-md border border-white/20 rounded-3xl p-6 flex flex-col justify-center items-center gap-6 text-center">
            <button 
              onClick={toggleRecording}
              className={`w-16 h-16 rounded-full flex items-center justify-center transition-all shadow-2xl relative
                ${isRecording ? "bg-red-500 scale-110 shadow-red-500/40" : "bg-emerald-500 hover:bg-emerald-400 shadow-emerald-500/40"}`}
            >
              {isRecording ? <MicOff className="w-8 h-8" /> : <Mic className="w-8 h-8 text-black" />}
              {isRecording && (
                 <span className="absolute inset-[-8px] border-2 border-red-500 rounded-full animate-ping opacity-20 pointer-events-none"></span>
              )}
            </button>
            <div>
              <p className="text-sm font-semibold tracking-tight uppercase">
                {isRecording ? t("voiceDesc") : t("waiting")}
              </p>
              <p className="text-[10px] text-white/50 mt-1 uppercase tracking-widest italic leading-relaxed">
                {isRecording ? "..." : `"${t("voicePlaceholder")}"`}
              </p>
            </div>
            
            {/* Audio Waves */}
            <div className="flex gap-1 items-end h-8">
              {[0.4, 0.7, 1.0, 0.5, 0.8, 0.3, 0.6].map((scale, i) => (
                <motion.div 
                  key={i}
                  animate={isRecording ? { height: ["20%", scale * 100 + "%", "20%"] } : { height: "10%" }}
                  transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.1 }}
                  className="w-1 bg-emerald-400 rounded-full"
                ></motion.div>
              ))}
            </div>
          </div>

          <button 
              onClick={runAnalysis}
              disabled={isAnalyzing}
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-black py-4 rounded-2xl shadow-xl shadow-emerald-900/40 flex items-center justify-center gap-2 uppercase tracking-[0.2em] transition-all disabled:grayscale disabled:opacity-50"
            >
              {isAnalyzing ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
              {isAnalyzing ? "..." : t("run")}
          </button>
        </section>
      </div>

      {/* FOOTER STATS */}
      <footer className="fixed bottom-4 left-4 right-4 md:left-6 md:right-6 lg:left-6 lg:right-6 flex flex-col md:flex-row justify-between items-center bg-black/30 backdrop-blur-md border border-white/5 rounded-2xl px-8 py-3 z-40 gap-2 md:gap-0">
        <div className="flex gap-8">
          <div>
            <span className="text-[10px] text-white/40 block uppercase tracking-widest">{t("statsTotal")}</span>
            <span className="font-mono text-emerald-400">012 / 250</span>
          </div>
          <div>
            <span className="text-[10px] text-white/40 block uppercase tracking-widest">{t("statsHealth")}</span>
            <span className="font-mono text-emerald-400">99.8% OK</span>
          </div>
        </div>
        <div className="text-[10px] text-white/30 tracking-widest uppercase font-medium">
          {t("power")} • <span className="text-emerald-400/50">{t("synced")}</span>
        </div>
      </footer>

      {/* History Modal (Frosted Version) */}
      <AnimatePresence>
        {showHistory && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-md z-[60] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-zinc-900/90 border border-white/10 w-full max-w-2xl rounded-3xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)] flex flex-col max-h-[80vh]"
            >
              <div className="p-6 bg-white/5 border-b border-white/5 flex items-center justify-between">
                <h2 className="text-xl font-bold flex items-center gap-2 tracking-tight">
                  <History className="w-5 h-5 text-emerald-400" />
                  {t("history")}
                </h2>
                <button onClick={() => setShowHistory(false)} className="text-white/40 hover:text-white transition-colors">
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                {history.length === 0 ? (
                  <div className="text-center py-20 text-white/20 italic uppercase tracking-widest text-xs">{t("noHistory")}</div>
                ) : (
                  history.map((entry) => (
                    <div 
                      key={entry.id} 
                      onClick={() => {
                        setResult(entry.analysis);
                        setShowHistory(false);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      className="bg-white/5 p-5 rounded-2xl border border-white/5 hover:border-emerald-500/50 transition-all cursor-pointer group flex items-start justify-between gap-4"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">{entry.crop}</p>
                          <span className="w-1 h-1 bg-white/20 rounded-full"></span>
                          <span className="text-[10px] font-mono text-white/30">{new Date(entry.timestamp).toLocaleDateString()}</span>
                        </div>
                        <h4 className="font-bold text-lg text-white mb-1 truncate uppercase tracking-tight">{entry.analysis.diagnosis}</h4>
                        <p className="text-sm text-white/40 line-clamp-1 italic">"{entry.transcript || "Visual analysis scanning feed..."}"</p>
                      </div>
                      <div className="bg-emerald-500/10 p-2.5 rounded-xl group-hover:bg-emerald-500 group-hover:text-black transition-all">
                        <ArrowRight className="w-4 h-4" />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

       <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.05);
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>
    </div>
  );
}

function LucideClose() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-x"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
  )
}

