
import React, { useState, useRef } from 'react';
import { analyzeArtifact, generateImage, generateSpeech } from './services/geminiService';
import { AppStatus, ReconstructionData } from './types';
import ComparisonSlider from './components/ComparisonSlider';
import HotspotLayer from './components/HotspotLayer';

const LogoIcon = () => (
  <svg width="40" height="40" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M50 10L15 30V70L50 90L85 70V30L50 10Z" stroke="#d4af37" strokeWidth="2" strokeLinecap="round" />
    <path d="M30 40C30 30 40 25 50 25C60 25 70 30 70 40V60C70 70 60 75 50 75" stroke="#d4af37" strokeWidth="3" strokeDasharray="5 5" strokeOpacity="0.6" />
    <path d="M40 50H60M50 40V60" stroke="#d4af37" strokeWidth="1.5" strokeOpacity="0.8" />
    <circle cx="50" cy="50" r="45" stroke="#d4af37" strokeOpacity="0.1" strokeWidth="0.5" />
    <rect x="20" y="20" width="10" height="2" fill="#d4af37" fillOpacity="0.8" />
    <rect x="70" y="78" width="10" height="2" fill="#d4af37" fillOpacity="0.8" />
  </svg>
);

const App: React.FC = () => {
  /* -------------------------------------------------------------
     EXISTING STATE
  ------------------------------------------------------------- */
  const [status, setStatus] = useState<AppStatus>('complete');
  const [data, setData] = useState<ReconstructionData>({
    analysis: {
      identification: { civilization: 'Debug', type: 'Test', era: 'Now', region: 'Local', material: 'Bits', exactYearRange: '2024' },
      pastReconstruction: { description: 'Debug Mode', visualPrompt: '', hotspots: [] },
      modernRestoration: { description: '', visualPrompt: '' },
      timeline: [],
      confidenceScore: 100,
      confidenceExplanation: 'Debug',
      assumptions: '',
      curatorNarrative: 'Debug',
      damageAnalysis: { description: '', missingSections: '' },
      sources: []
    },
    pastImage: 'https://placehold.co/600x600/121212/FFF.png?text=Reconstruction',
    presentImage: null,
    originalImage: 'https://placehold.co/600x600/343434/FFF.png?text=Original',
  });
  const [artifactContext, setArtifactContext] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const decodeBase64 = (base64: string) => {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
    return bytes;
  };

  const decodeAudioData = async (data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> => {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
    for (let channel = 0; channel < numChannels; channel++) {
      const channelData = buffer.getChannelData(channel);
      for (let i = 0; i < frameCount; i++) channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
    return buffer;
  };

  const processFile = async (file: File) => {
    setStatus('analyzing');
    setError(null);

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      setData(prev => ({ ...prev, originalImage: base64 }));

      try {
        const analysisResult = await analyzeArtifact(base64, artifactContext);
        setData(prev => ({ ...prev, analysis: analysisResult }));

        setStatus('generating');
        const [past, present, audioBase64] = await Promise.all([
          generateImage(analysisResult.pastReconstruction.visualPrompt),
          generateImage(analysisResult.modernRestoration.visualPrompt),
          generateSpeech(analysisResult.curatorNarrative)
        ]);

        setData(prev => ({
          ...prev,
          pastImage: past,
          presentImage: present,
          audioBlob: audioBase64
        }));
        setStatus('complete');
      } catch (err: any) {
        console.error(err);
        const msg = (err.message || '').toLowerCase();
        if (msg.includes('permission') || msg.includes('403') || msg.includes('not found')) {
          setError('API access refused. Check your backend GEMINI_API_KEY and billing settings.');
        } else if (msg.includes('500') || msg.includes('internal')) {
          setError("The AI model encountered a temporary hiccup. Please try again.");
        } else {
          setError(err.message || 'Forensic analysis failed. The image might be too blurry or complex.');
        }
        setStatus('error');
      }
    };
    reader.readAsDataURL(file);
  };

  /* -------------------------------------------------------------
     UPLOAD INTERCEPTION
  ------------------------------------------------------------- */
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    processFile(file);

    // Reset value so onChange triggers again if same file selected
    event.target.value = '';
  };


  const retryScan = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    } else {
      reset();
    }
  };

  const stopAudio = () => {
    if (audioSourceRef.current) {
      try { audioSourceRef.current.stop(); } catch (e) { }
      audioSourceRef.current = null;
    }
    setIsPlaying(false);
  };

  const playNarrative = async () => {
    if (isPlaying) { stopAudio(); return; }
    if (!data.audioBlob) return;
    try {
      if (!audioContextRef.current) audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      const ctx = audioContextRef.current;
      const base64Str = data.audioBlob.includes(',') ? data.audioBlob.split(',')[1] : data.audioBlob;
      const bytes = decodeBase64(base64Str);
      const audioBuffer = await decodeAudioData(bytes, ctx, 24000, 1);
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.onended = () => { setIsPlaying(false); audioSourceRef.current = null; };
      audioSourceRef.current = source;
      source.start();
      setIsPlaying(true);
    } catch (err) {
      console.error(err);
      setIsPlaying(false);
    }
  };

  const reset = () => {
    stopAudio();
    setStatus('idle');
    setData({ analysis: null, pastImage: null, presentImage: null, originalImage: null });
    setError(null);
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white selection:bg-[#d4af37]/30 font-sans cyber-grid overflow-x-hidden">
      {/* HUD Header */}
      <nav className="fixed top-0 left-0 right-0 z-[100] h-20 px-8 flex items-center justify-between border-b border-white/5 glass-card">
        <div className="flex items-center gap-4">
          <LogoIcon />
          <div>
            <span className="text-2xl font-serif italic tracking-tighter block leading-none glow-text gold-gradient">artifact.ai</span>
            <span className="text-[10px] uppercase tracking-[0.3em] text-[#d4af37]/60 font-bold">Neural Forensic Lab</span>
          </div>
        </div>
        <div className="flex items-center gap-6">
          {status === 'complete' && (
            <button
              onClick={playNarrative}
              className={`flex items-center gap-3 px-6 py-2 rounded-full border text-xs font-bold uppercase tracking-widest transition-all ${isPlaying ? 'bg-[#d4af37] text-black border-[#d4af37] shadow-lg shadow-[#d4af37]/20' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'}`}
            >
              <i className={`fas ${isPlaying ? 'fa-pause' : 'fa-headphones'}`}></i>
              {isPlaying ? 'Guide Active' : 'Listen to Curator'}
            </button>
          )}
          {status !== 'idle' && (
            <button onClick={reset} className="text-xs font-bold uppercase tracking-widest text-stone-500 hover:text-white transition-colors">
              Reset System
            </button>
          )}
        </div>
      </nav>

      {/* Main Area */}
      <main className="max-w-[1400px] mx-auto px-8 pt-32 pb-20">
        {status === 'idle' && (
          <div className="max-w-4xl mx-auto py-20 text-center animate-in fade-in duration-1000">
            <h1 className="text-7xl md:text-9xl font-serif italic mb-8 leading-tight">
              Archeology, <br /> <span className="gold-gradient not-italic font-sans tracking-tighter uppercase text-6xl md:text-8xl">Digitized.</span>
            </h1>
            <p className="text-stone-500 text-xl max-w-2xl mx-auto mb-16 font-light leading-relaxed">
              Upload any fragment. Our AI performs a neutral forensic search to ground its origin and <span className="text-white font-medium italic underline decoration-[#d4af37]">reassembles it volumetrically</span>.
            </p>


            <div className="max-w-xl mx-auto mb-12 relative group z-10">
              <textarea
                value={artifactContext}
                onChange={(e) => setArtifactContext(e.target.value)}
                placeholder="OPTIONAL: Provide context hint (e.g. 'Found in Rome, 2nd Century')"
                className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-stone-300 placeholder:text-stone-600 focus:outline-none focus:border-[#d4af37]/50 focus:bg-white/10 transition-all resize-none h-24 text-sm font-mono backdrop-blur-md"
              />
              <div className="absolute top-2 right-2 text-[10px] uppercase font-bold text-stone-600 tracking-widest pointer-events-none">
                Context Log
              </div>
            </div>

            <label className="relative block group cursor-pointer max-w-xl mx-auto">
              <div className="absolute -inset-4 bg-[#d4af37]/10 rounded-[3rem] blur-2xl opacity-0 group-hover:opacity-100 transition duration-700"></div>
              <div className="relative h-96 glass-card rounded-[2.5rem] border-2 border-dashed border-white/5 group-hover:border-[#d4af37]/30 transition-all flex flex-col items-center justify-center overflow-hidden">
                <input ref={fileInputRef} type="file" className="hidden" accept="image/*" onChange={handleFileUpload} />
                <div className="w-24 h-24 bg-white/5 rounded-3xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <LogoIcon />
                </div>
                <span className="text-sm font-bold uppercase tracking-widest text-stone-300">Initiate Forensic Scan</span>
                <span className="text-[10px] text-stone-600 mt-4 tracking-[0.2em] uppercase font-mono italic">Ready for shard analysis</span>
              </div>
            </label>
          </div>
        )}

        {(status === 'analyzing' || status === 'generating') && (
          <div className="max-w-xl mx-auto py-32 text-center relative">
            <div className="w-64 h-64 mx-auto mb-16 relative">
              <div className="absolute inset-0 rounded-full border-2 border-white/5"></div>
              <div className="absolute inset-0 rounded-full border-t-2 border-[#d4af37] animate-[spin_1.5s_linear_infinite]"></div>
              <div className="absolute inset-8 rounded-full border border-white/5 flex items-center justify-center">
                <LogoIcon />
              </div>
            </div>
            <h2 className="text-2xl font-bold tracking-[0.4em] uppercase text-white mb-4 animate-pulse">
              {status === 'analyzing' ? 'Grounding History' : 'Geometry Synthesis'}
            </h2>
            <p className="text-stone-600 mt-6 font-mono text-[10px] uppercase tracking-widest">
              {status === 'analyzing' ? 'Fetching global archaeological records...' : 'Synthesizing complete volumetric data...'}
            </p>
          </div>
        )}

        {status === 'complete' && data.analysis && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 animate-in fade-in slide-in-from-bottom-8 duration-1000">

            {/* Visual Section */}
            <div className="lg:col-span-8 space-y-12">
              <section className="glass-card rounded-[3rem] p-10 relative overflow-hidden border-white/10">
                <div className="flex justify-between items-center mb-8">
                  <h3 className="text-xs font-bold uppercase tracking-[0.3em] text-[#d4af37]">Reassembly Workspace</h3>
                  <div className="px-4 py-1.5 rounded-full bg-[#d4af37]/10 border border-[#d4af37]/20 text-[10px] font-mono text-[#d4af37] font-bold uppercase tracking-widest">
                    ID: {data.analysis.identification.civilization}
                  </div>
                </div>

                <div className="relative aspect-square bg-stone-950 rounded-3xl overflow-hidden border border-white/5 group shadow-2xl flex items-center justify-center">
                  {data.originalImage && data.pastImage && (
                    <ComparisonSlider
                      beforeImage={data.originalImage}
                      afterImage={data.pastImage}
                      beforeLabel="Found Fragment"
                      afterLabel="Reconstructed"
                    />
                  )}
                  <HotspotLayer hotspots={data.analysis.pastReconstruction.hotspots} />
                  <div className="scan-line"></div>
                </div>

                <div className="mt-8 p-8 bg-stone-900/40 border border-white/5 rounded-[2rem]">
                  <h4 className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-4">Archaeological Brief</h4>
                  <p className="text-lg text-stone-300 leading-relaxed font-serif italic">
                    "{data.analysis.pastReconstruction.description}"
                  </p>
                </div>
              </section>

              <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="glass-card rounded-[2.5rem] p-8 border-white/5">
                  <h4 className="text-[10px] font-bold uppercase tracking-[0.3em] text-stone-500 mb-8">Metadata Match</h4>
                  <div className="space-y-6">
                    <div className="border-b border-white/5 pb-4">
                      <span className="text-[10px] text-stone-600 uppercase block mb-1">Civilization</span>
                      <span className="text-xl font-serif text-white leading-tight">{data.analysis.identification.civilization}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-[10px] text-stone-600 uppercase block mb-1">Object Class</span>
                        <span className="text-sm font-bold text-[#d4af37]">{data.analysis.identification.type}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-stone-600 uppercase block mb-1">Period</span>
                        <span className="text-sm font-bold text-white">{data.analysis.identification.era}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="glass-card rounded-[2.5rem] p-8 border-white/5">
                  <h4 className="text-[10px] font-bold uppercase tracking-[0.3em] text-stone-500 mb-8">Model Confidence</h4>
                  <div className="flex items-end gap-2 mb-4">
                    <span className="text-6xl font-black text-[#d4af37] leading-none">{data.analysis.confidenceScore}%</span>
                    <span className="text-[10px] uppercase font-bold text-stone-600 pb-1">Score</span>
                  </div>
                  <p className="text-xs text-stone-400 leading-relaxed">
                    {data.analysis.confidenceExplanation}
                  </p>
                </div>
              </section>
            </div>

            {/* Sidebar Data Section */}
            <div className="lg:col-span-4 space-y-12">
              <section className="glass-card rounded-[3rem] p-10 h-full border-white/5 flex flex-col">
                <h3 className="text-3xl font-serif italic mb-10">Forensic Evidence</h3>

                <div className="space-y-10 flex-1">
                  <div>
                    <h4 className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#d4af37] mb-6">Grounding Sources</h4>
                    <div className="space-y-4">
                      {data.analysis.sources && data.analysis.sources.length > 0 ? (
                        data.analysis.sources.map((source, i) => (
                          <a
                            key={i}
                            href={source.uri}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 p-4 bg-white/5 rounded-2xl border border-white/5 hover:border-[#d4af37]/40 hover:bg-white/10 transition-all group"
                          >
                            <i className="fas fa-search text-xs text-stone-600 group-hover:text-[#d4af37]"></i>
                            <span className="text-xs text-stone-400 group-hover:text-white truncate font-medium">{source.title}</span>
                          </a>
                        ))
                      ) : (
                        <p className="text-xs text-stone-600 italic">No external sources indexed for this match.</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-[10px] font-bold uppercase tracking-[0.3em] text-stone-500 mb-6">History Timeline</h4>
                    <div className="space-y-8">
                      {data.analysis.timeline.map((event, i) => (
                        <div key={i} className="relative pl-8">
                          {i < data.analysis!.timeline.length - 1 && <div className="absolute left-[3px] top-4 w-px h-full bg-white/10"></div>}
                          <div className="absolute left-0 top-1.5 w-2 h-2 rounded-full bg-[#d4af37] shadow-[0_0_10px_rgba(212,175,55,0.5)]"></div>
                          <span className="text-xs font-bold text-white block mb-1">{event.year}</span>
                          <p className="text-xs text-stone-500 leading-normal">{event.event}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-12 pt-8 border-t border-white/5">
                  <div className="p-6 bg-[#d4af37]/5 rounded-3xl border border-[#d4af37]/10">
                    <div className="flex items-center gap-3 mb-3">
                      <i className="fas fa-podcast text-[#d4af37] text-sm"></i>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-white">Fact-Checked Guide</span>
                    </div>
                    <p className="text-xs text-stone-400 leading-relaxed italic font-serif">
                      "{data.analysis.curatorNarrative.split('.')[0]}..."
                    </p>
                  </div>
                </div>
              </section>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="max-w-xl mx-auto py-32 text-center">
            <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-8 border border-red-500/20">
              <i className="fas fa-exclamation-triangle text-3xl text-red-500"></i>
            </div>
            <h2 className="text-2xl font-serif italic mb-4">Reconstruction Halted</h2>
            <p className="text-stone-400 mb-10">{error}</p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button onClick={retryScan} className="bg-[#d4af37] text-black px-10 py-3 rounded-full font-bold uppercase tracking-widest text-xs hover:scale-105 transition-transform shadow-lg shadow-[#d4af37]/20">
                Retry Scan
              </button>
              <button onClick={reset} className="px-10 py-3 rounded-full font-bold uppercase tracking-widest text-xs border border-white/10 hover:bg-white/5 transition-colors">
                New Fragment
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Warning Modal */}

      {/* Audio Engine UI */}
      {isPlaying && (
        <div className="fixed bottom-10 right-10 z-[100] w-96 glass-card p-8 rounded-[2rem] border-[#d4af37]/40 animate-in slide-in-from-bottom-10 shadow-2xl">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-[#d4af37] flex items-center justify-center text-[#050505]">
              <i className="fas fa-waveform"></i>
            </div>
            <div className="flex-1">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#d4af37] block mb-0.5">Synthesis Engine</span>
              <div className="h-1 w-full bg-white/5 rounded-full mt-2 overflow-hidden">
                <div className="h-full bg-[#d4af37] animate-[loading_2s_linear_infinite]"></div>
              </div>
            </div>
            <button onClick={stopAudio} className="text-stone-500 hover:text-white p-2 transition-colors">
              <i className="fas fa-times"></i>
            </button>
          </div>
          <p className="text-sm italic font-serif leading-relaxed text-white">"{data.analysis?.curatorNarrative}"</p>
        </div>
      )}

      <style>{`
        @keyframes loading {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}</style>
    </div>
  );
};

export default App;
