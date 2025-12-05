
import React, { useState, useEffect, useRef } from 'react';
import { Search, Loader2, ArrowRight, X, BarChart3, Building, Briefcase, Map, Filter, Check, ChevronRight, ChevronDown, ChevronLeft, Clock, AlertTriangle, User as UserIcon, Heart, LayoutGrid, LogIn, Mail, Lock, Plus, Save } from 'lucide-react';
import Header from './components/Header';
import { IntelligenceCard, SkeletonCard, DeepScanReport } from './components/MarkdownDisplay';
import SourcesList from './components/SourcesList';
import { performDiscoverySearch, enrichCompanyData, generateDeepScan } from './services/geminiService';
import { authService } from './services/authService';
import { SearchState, DiscoveredCompany, GroundingChunk, User } from './types';

const DUTCH_LOCATIONS = [
    "Heel Nederland",
    "Drenthe", "Flevoland", "Friesland", "Gelderland", "Groningen", "Limburg", "Noord-Brabant", "Noord-Holland", "Overijssel", "Utrecht", "Zeeland", "Zuid-Holland",
    "Alkmaar", "Almelo", "Almere", "Alphen aan den Rijn", "Amersfoort", "Amstelveen", "Amsterdam", "Apeldoorn", "Arnhem", 
    "Breda", "Delft", "Den Haag", "Deventer", "Dordrecht", "Ede", "Eindhoven", "Emmen", "Enschede", 
    "Gouda", "Groningen", "Haarlem", "Haarlemmermeer", "Heerlen", "Helmond", "Hengelo", "Hilversum", 
    "Leeuwarden", "Leiden", "Lelystad", "Maastricht", "Nijmegen", "Oss", "Purmerend", 
    "Roosendaal", "Rotterdam", "Schiedam", "'s-Hertogenbosch", "Sittard-Geleen", "Spijkenisse", 
    "Tilburg", "Utrecht (Stad)", "Veenendaal", "Venlo", "Vlaardingen", "Westland", "Zaanstad", "Zoetermeer", "Zwolle"
].sort();

const RESULTS_PER_PAGE = 12; // Increased for faster visual fill
const ENRICHMENT_DELAY_MS = 0; // ZERO DELAY for Premium speed

const App: React.FC = () => {
  // AUTH STATE
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  
  // LOGIN FORM
  const [loginIdent, setLoginIdent] = useState('');
  const [loginPass, setLoginPass] = useState('');
  
  // REGISTER FORM
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPass, setRegPass] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  // SETTINGS MODAL
  const [showSettings, setShowSettings] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editAvatar, setEditAvatar] = useState('');

  // APP STATE
  const [viewMode, setViewMode] = useState<'search' | 'favorites'>('search');
  const [favorites, setFavorites] = useState<DiscoveredCompany[]>([]);
  
  // SEARCH STATES
  const [city, setCity] = useState('');
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedSpecs, setSelectedSpecs] = useState<string[]>([]);
  const [selectedScale, setSelectedScale] = useState<string[]>([]);
  const [selectedExperience, setSelectedExperience] = useState<string[]>([]);
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);

  const [foundCompanies, setFoundCompanies] = useState<DiscoveredCompany[]>([]);
  const [enrichedData, setEnrichedData] = useState<Record<string, { content: string, chunks: GroundingChunk[] }>>({});
  const [totalMatches, setTotalMatches] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchState, setSearchState] = useState<SearchState>({ isLoading: false, data: null, error: null });
  
  const [isCoolingDown, setIsCoolingDown] = useState(false);
  const [cooldownTimer, setCooldownTimer] = useState(0);
  const processingRef = useRef<Set<string>>(new Set());

  const [deepScanState, setDeepScanState] = useState({
      isOpen: false,
      isLoading: false,
      companyName: '',
      placeData: null as any,
      error: null as string | null
  });

  // INITIAL LOAD
  useEffect(() => {
      const user = authService.getCurrentUser();
      if (user) {
          setCurrentUser(user);
          setFavorites(authService.getFavorites(user.id));
          setEditName(user.username);
          setEditEmail(user.email);
          setEditAvatar(user.avatarUrl || '');
          
          // Load cache
          const savedData = localStorage.getItem(`inncempro_data_${user.id}`);
          if (savedData) {
              setEnrichedData(JSON.parse(savedData));
          }
      }
  }, []);

  // AUTH HANDLERS
  const handleAuthSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      setAuthError(null);
      try {
          let user;
          if (authMode === 'login') {
              user = authService.login(loginIdent, loginPass);
          } else {
              user = authService.register(regName, regEmail, regPass);
          }
          setCurrentUser(user);
          setFavorites(authService.getFavorites(user.id));
          setEditName(user.username);
          setEditEmail(user.email);
          setEditAvatar(user.avatarUrl || '');
          
          // Restore cache
          const savedData = localStorage.getItem(`inncempro_data_${user.id}`);
          if (savedData) setEnrichedData(JSON.parse(savedData));

      } catch (err: any) {
          setAuthError(err.message);
      }
  };

  const handleLogout = () => {
      authService.logout();
      setCurrentUser(null);
      setFoundCompanies([]);
      setEnrichedData({});
      setAuthMode('login');
      setLoginIdent(''); setLoginPass('');
  };

  const handleUpdateProfile = (e: React.FormEvent) => {
      e.preventDefault();
      if (!currentUser) return;
      try {
          const updated = authService.updateProfile(currentUser.id, {
              username: editName,
              email: editEmail,
              avatarUrl: editAvatar
          });
          setCurrentUser(updated);
          setShowSettings(false);
      } catch (err: any) {
          alert(err.message);
      }
  };

  // APP LOGIC
  const toggleFavorite = (company: DiscoveredCompany) => {
      if (!currentUser) return;
      const newFavs = authService.toggleFavorite(currentUser.id, company);
      setFavorites(newFavs);
      
      // Save data cache for favorites so they load offline/next time
      if (enrichedData[company.id]) {
           const currentCache = JSON.parse(localStorage.getItem(`inncempro_data_${currentUser.id}`) || '{}');
           currentCache[company.id] = enrichedData[company.id];
           localStorage.setItem(`inncempro_data_${currentUser.id}`, JSON.stringify(currentCache));
      }
  };

  const toggleFilter = (set: React.Dispatch<React.SetStateAction<string[]>>, item: string) => {
    set(prev => prev.includes(item) ? prev.filter(i => i !== item) : [...prev, item]);
  };

  // COOLDOWN LOGIC
  useEffect(() => {
    let interval: any;
    if (isCoolingDown && cooldownTimer > 0) {
      interval = setInterval(() => {
        setCooldownTimer((prev) => {
          if (prev <= 1) {
             setIsCoolingDown(false); 
             return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isCoolingDown, cooldownTimer]);

  const triggerCooldown = () => {
      if (!isCoolingDown) {
          setIsCoolingDown(true);
          setCooldownTimer(30); 
      }
  };

  // SEARCH EXECUTION
  const executeSearch = async (overrideCity?: string) => {
      if (isCoolingDown) return;
      setViewMode('search');

      setSearchState({ isLoading: true, data: null, error: null });
      setFoundCompanies([]);
      setTotalMatches(0);
      setCurrentPage(1);
      processingRef.current.clear();

      try {
          const regions = overrideCity ? [overrideCity] : (selectedRegions.length > 0 ? selectedRegions : ['Heel Nederland']);
          const types = selectedTypes.length > 0 ? selectedTypes : ['Architecten', 'Aannemers'];
          const specs = selectedSpecs;
          const other = [...selectedScale, ...selectedExperience, ...selectedEmployees];

          const discoveryResult = await performDiscoverySearch(types, regions, specs, other);
          
          setFoundCompanies(discoveryResult.companies);
          setTotalMatches(discoveryResult.totalEstimatedMatches || discoveryResult.companies.length);
          setSearchState({ isLoading: false, data: { text: 'Done' }, error: null });

      } catch (error: any) {
          if (error.message?.includes('429') || error.message?.includes('Quota')) {
             triggerCooldown();
             setSearchState({ isLoading: false, data: null, error: null }); 
          } else {
             setSearchState({ isLoading: false, data: null, error: error.message || "Fout bij zoeken" });
          }
      }
  };

  const handleManualSearch = (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      executeSearch(city || undefined);
  };

  // LAZY ENRICHMENT LOOP
  useEffect(() => {
      let active = true;

      const enrichVisibleItems = async () => {
          if (isCoolingDown || viewMode === 'favorites') return;

          const startIndex = (currentPage - 1) * RESULTS_PER_PAGE;
          const visibleCompanies = foundCompanies.slice(startIndex, startIndex + RESULTS_PER_PAGE);

          // Only enrich if we haven't already and aren't currently processing
          const toEnrich = visibleCompanies.filter(c => 
              !enrichedData[c.id] && !processingRef.current.has(c.id)
          );

          if (toEnrich.length === 0) return;

          // Fire all requests in parallel for maximum speed (User has Premium)
          toEnrich.forEach(company => {
              if (processingRef.current.has(company.id)) return;
              processingRef.current.add(company.id);
              
              enrichCompanyData(company.name, company.city)
                  .then(result => {
                      if (!active) return;
                      if (result.markdownContent) {
                          setEnrichedData(prev => ({
                              ...prev,
                              [company.id]: { content: result.markdownContent, chunks: result.groundingChunks }
                          }));
                      }
                      processingRef.current.delete(company.id);
                  })
                  .catch(error => {
                      processingRef.current.delete(company.id);
                      if (error.message?.includes('429')) triggerCooldown();
                  });
          });
      };

      if (foundCompanies.length > 0) {
          enrichVisibleItems();
      }

      return () => { active = false; };
  }, [foundCompanies, currentPage, enrichedData, isCoolingDown, viewMode]);

  // DEEP SCAN
  const handleDeepScanAction = async (action: string, value: string) => {
      if (action === 'deepscan') {
          if (isCoolingDown) {
              alert(`Gratis API limiet bereikt. Wacht ${cooldownTimer}s.`);
              return;
          }
          setDeepScanState({ isOpen: true, isLoading: true, companyName: value, placeData: null, error: null });
          const cityContext = selectedRegions[0] || 'Nederland';
          try {
              const placeData = await generateDeepScan(value, cityContext);
              setDeepScanState(prev => ({ ...prev, isLoading: false, placeData: placeData }));
          } catch (error: any) {
               if (error.message?.includes('429')) {
                   triggerCooldown();
                   setDeepScanState(prev => ({ ...prev, isLoading: false, error: `Limiet bereikt. Wacht ${cooldownTimer}s...` }));
               } else {
                   setDeepScanState(prev => ({ ...prev, isLoading: false, error: "Kan gegevens niet ophalen. Probeer het later nog eens." }));
               }
          }
      }
  };

  const closeDeepScan = () => setDeepScanState(prev => ({ ...prev, isOpen: false }));
  
  const resetToHome = () => {
    setFoundCompanies([]);
    setSearchState({ isLoading: false, data: null, error: null });
    setCity('');
    setSelectedRegions([]);
    setIsCoolingDown(false);
    setCooldownTimer(0);
    processingRef.current.clear();
    setViewMode('search');
  };

  const itemsToShow = viewMode === 'favorites' ? favorites : foundCompanies;
  const totalPages = Math.ceil(itemsToShow.length / RESULTS_PER_PAGE);
  const currentItems = itemsToShow.slice((currentPage - 1) * RESULTS_PER_PAGE, currentPage * RESULTS_PER_PAGE);
  const visibleChunks = currentItems.map(c => enrichedData[c.id]?.chunks || []).flat();

  // ----- RENDER: LOGIN SCREEN -----
  if (!currentUser) {
      return (
          <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6 font-sans">
              <div className="bg-white p-10 shadow-xl border border-slate-200 max-w-md w-full rounded-sm text-center relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-2 bg-[#009FE3]"></div>
                  <div className="flex justify-center mb-6">
                      <img src="https://www.inncempro.nl/wp-content/uploads/2018/06/Logo-Inncempro-facebook.png" alt="Inncempro Logo" className="w-24 h-24 object-contain"/>
                  </div>
                  <h1 className="text-3xl font-black text-slate-900 font-condensed uppercase tracking-tight mb-2">Market Intelligence</h1>
                  <p className="text-slate-500 mb-8 text-sm">Log in om toegang te krijgen tot het dashboard en uw favorieten.</p>
                  
                  {authError && <div className="bg-red-50 text-red-600 text-xs p-3 mb-4 rounded-sm">{authError}</div>}

                  <form onSubmit={handleAuthSubmit} className="space-y-4">
                      {authMode === 'register' && (
                          <div className="text-left animate-fade-in">
                              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider font-condensed mb-1 block">Naam (Weergave)</label>
                              <div className="relative">
                                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                  <input type="text" value={regName} onChange={(e) => setRegName(e.target.value)} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 focus:border-[#009FE3] focus:outline-none rounded-sm font-medium" required={authMode === 'register'} placeholder="Uw Naam"/>
                              </div>
                          </div>
                      )}
                      
                      <div className="text-left">
                          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider font-condensed mb-1 block">
                              {authMode === 'login' ? 'Gebruikersnaam of Email' : 'Emailadres'}
                          </label>
                          <div className="relative">
                              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                              <input 
                                type="text" 
                                value={authMode === 'login' ? loginIdent : regEmail}
                                onChange={(e) => authMode === 'login' ? setLoginIdent(e.target.value) : setRegEmail(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 focus:border-[#009FE3] focus:outline-none rounded-sm font-medium"
                                required
                                placeholder={authMode === 'login' ? 'naam@bedrijf.nl' : 'naam@bedrijf.nl'}
                              />
                          </div>
                      </div>

                      <div className="text-left">
                          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider font-condensed mb-1 block">Wachtwoord</label>
                          <div className="relative">
                              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                              <input 
                                type="password" 
                                value={authMode === 'login' ? loginPass : regPass}
                                onChange={(e) => authMode === 'login' ? setLoginPass(e.target.value) : setRegPass(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 focus:border-[#009FE3] focus:outline-none rounded-sm font-medium"
                                required
                                placeholder="••••••••"
                              />
                          </div>
                      </div>

                      <button type="submit" className="w-full py-3.5 bg-[#E85E26] hover:bg-[#d14d1b] text-white font-bold uppercase tracking-wider rounded-sm flex items-center justify-center gap-2 transition-colors">
                          {authMode === 'login' ? <><LogIn className="w-4 h-4" /> Inloggen</> : <><Plus className="w-4 h-4" /> Account Maken</>}
                      </button>
                  </form>

                  <div className="mt-6 pt-4 border-t border-slate-100">
                      <button onClick={() => {setAuthMode(authMode === 'login' ? 'register' : 'login'); setAuthError(null);}} className="text-xs font-bold text-[#009FE3] hover:underline uppercase tracking-wide">
                          {authMode === 'login' ? 'Nog geen account? Registreren' : 'Al een account? Inloggen'}
                      </button>
                  </div>
              </div>
          </div>
      );
  }

  // ----- RENDER: DASHBOARD -----
  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col font-sans text-slate-800">
      <Header user={currentUser} onHomeClick={resetToHome} onLogout={handleLogout} onOpenSettings={() => setShowSettings(true)} />

      {/* SETTINGS MODAL */}
      {showSettings && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
              <div className="bg-white w-full max-w-md p-6 rounded-sm shadow-xl animate-fade-in relative">
                  <button onClick={() => setShowSettings(false)} className="absolute right-4 top-4 text-slate-400 hover:text-slate-800"><X className="w-5 h-5"/></button>
                  <h2 className="text-xl font-black text-slate-900 uppercase font-condensed mb-6">Profiel Instellingen</h2>
                  <form onSubmit={handleUpdateProfile} className="space-y-4">
                      <div>
                          <label className="text-xs font-bold text-slate-700 uppercase mb-1 block">Weergavenaam</label>
                          <input type="text" value={editName} onChange={e => setEditName(e.target.value)} className="w-full p-2 border border-slate-200 rounded-sm" />
                      </div>
                      <div>
                          <label className="text-xs font-bold text-slate-700 uppercase mb-1 block">Email</label>
                          <input type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} className="w-full p-2 border border-slate-200 rounded-sm" />
                      </div>
                      <div>
                          <label className="text-xs font-bold text-slate-700 uppercase mb-1 block">Avatar URL</label>
                          <input type="text" value={editAvatar} onChange={e => setEditAvatar(e.target.value)} className="w-full p-2 border border-slate-200 rounded-sm" placeholder="https://..." />
                          <p className="text-[10px] text-slate-400 mt-1">Plak een afbeeldingslink.</p>
                      </div>
                      <button type="submit" className="w-full py-3 bg-[#009FE3] text-white font-bold uppercase rounded-sm flex items-center justify-center gap-2 hover:bg-[#008ac5]">
                          <Save className="w-4 h-4" /> Opslaan
                      </button>
                  </form>
              </div>
          </div>
      )}

      {/* COOLDOWN BANNER */}
      {isCoolingDown && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-6 py-4 flex flex-col sm:flex-row items-center justify-center gap-4 shadow-sm animate-fade-in">
             <div className="flex items-center gap-3">
                 <AlertTriangle className="w-5 h-5 text-amber-600" />
                 <div><span className="text-sm font-black uppercase tracking-wider font-condensed block">API Limiet Veiligheid</span><span className="text-xs text-amber-700">Systeem koelt af.</span></div>
             </div>
             <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-sm border border-amber-100 shadow-sm">
                 <Clock className="w-4 h-4 text-[#E85E26] animate-pulse" />
                 <span className="font-mono font-bold text-lg text-slate-800 w-8 text-center">{cooldownTimer}s</span>
             </div>
        </div>
      )}

      {/* MAIN LAYOUT */}
      <div className="flex flex-col md:flex-row max-w-[1400px] mx-auto w-full flex-grow">
          <aside className="w-full md:w-80 bg-white border-r border-slate-200 flex-shrink-0 hidden md:flex flex-col h-[calc(100vh-112px)] sticky top-28">
               <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                  <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest font-condensed flex items-center gap-2"><Filter className="w-4 h-4 text-[#009FE3]" /> Filters</h2>
              </div>
              <div className="flex-grow overflow-y-auto p-6 space-y-2 scrollbar-thin">
                   <CollapsibleFilterGroup title="Regio & Locatie" items={DUTCH_LOCATIONS} selectedItems={selectedRegions} onToggleItem={(item) => toggleFilter(setSelectedRegions, item)} searchable={true} />
                   <CollapsibleFilterGroup title="Disciplines" items={['Architecten', 'Aannemers', 'Design & Build', 'Gevelspecialisten']} selectedItems={selectedTypes} onToggleItem={(item) => toggleFilter(setSelectedTypes, item)} />
                   <CollapsibleFilterGroup title="Specialisme" items={['Woningbouw', 'Utiliteitsbouw', 'Renovatie', 'Duurzaamheid', 'Inncempro Materialen']} selectedItems={selectedSpecs} onToggleItem={(item) => toggleFilter(setSelectedSpecs, item === 'Inncempro Materialen' ? 'inncempro_materials' : item)} />
                   <CollapsibleFilterGroup title="Schaal" items={['XL Projecten', 'MKB / Middenbouw', 'Particulier']} selectedItems={selectedScale} onToggleItem={(item) => toggleFilter(setSelectedScale, item)} />
                   <CollapsibleFilterGroup title="Ervaring" items={['> 5 Jaar', '> 10 Jaar', '> 25 Jaar']} selectedItems={selectedExperience} onToggleItem={(item) => toggleFilter(setSelectedExperience, item)} />
                   <CollapsibleFilterGroup title="Aantal Medewerkers" items={['1-10', '10-50', '50+']} selectedItems={selectedEmployees} onToggleItem={(item) => toggleFilter(setSelectedEmployees, item)} />
              </div>
              <div className="p-6 border-t border-slate-200 bg-slate-50">
                  <button onClick={() => handleManualSearch()} disabled={isCoolingDown || searchState.isLoading || viewMode === 'favorites'} className="w-full py-3.5 bg-[#009FE3] hover:bg-[#008ac5] disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs font-bold uppercase tracking-[0.1em] transition-colors shadow-sm flex items-center justify-center gap-2">
                      {isCoolingDown ? 'Pauze...' : 'Update Resultaten'}
                  </button>
              </div>
          </aside>

          <main className="flex-grow p-6 lg:p-10 min-w-0 flex flex-col">
             <div className="max-w-4xl mx-auto w-full mb-6 flex gap-4">
                 <button onClick={() => setViewMode('search')} className={`flex-1 py-3 border-b-2 font-bold uppercase tracking-wider text-xs transition-colors flex items-center justify-center gap-2 ${viewMode === 'search' ? 'border-[#E85E26] text-[#E85E26]' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
                     <LayoutGrid className="w-4 h-4" /> Live Zoeken
                 </button>
                 <button onClick={() => { setViewMode('favorites'); setCurrentPage(1); }} className={`flex-1 py-3 border-b-2 font-bold uppercase tracking-wider text-xs transition-colors flex items-center justify-center gap-2 ${viewMode === 'favorites' ? 'border-[#E85E26] text-[#E85E26]' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
                     <Heart className={`w-4 h-4 ${viewMode === 'favorites' ? 'fill-current' : ''}`} /> Mijn Favorieten ({favorites.length})
                 </button>
             </div>

             {viewMode === 'search' && (
                 <div className="bg-white shadow-sm border border-slate-200 p-2 flex flex-col sm:flex-row gap-0 items-center max-w-4xl mx-auto w-full mb-8">
                    <div className="relative flex-grow w-full border-r border-slate-100">
                        <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 w-5 h-5" />
                        <input type="text" value={city} onChange={(e) => setCity(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleManualSearch()} placeholder="Zoek op stad, naam of term..." className="w-full pl-14 pr-4 py-4 bg-transparent text-slate-900 font-medium placeholder-slate-400 focus:outline-none text-base" />
                    </div>
                    <button onClick={() => handleManualSearch()} disabled={searchState.isLoading || isCoolingDown} className="w-full sm:w-auto bg-[#E85E26] hover:bg-[#d14d1b] disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold py-4 px-8 transition-all flex items-center justify-center gap-3 text-sm uppercase tracking-wider min-w-[160px]">
                        {searchState.isLoading ? <Loader2 className="animate-spin w-4 h-4"/> : <ArrowRight className="w-4 h-4" />}
                        <span>{isCoolingDown ? `${cooldownTimer}s` : 'Zoeken'}</span>
                    </button>
                </div>
             )}

            {searchState.error && !isCoolingDown && viewMode === 'search' && (
                <div className="max-w-4xl mx-auto w-full mb-8 bg-red-50 border border-red-200 p-4 text-red-800 rounded-sm">
                    <p className="font-bold text-sm uppercase flex items-center gap-2"><AlertTriangle className="w-4 h-4"/> Foutmelding</p>
                    <p className="text-sm mt-1">{searchState.error}</p>
                </div>
            )}

            {viewMode === 'search' && !foundCompanies.length && !searchState.isLoading && !searchState.error && (
                 <div className="py-20 text-center max-w-2xl mx-auto">
                    <div className="inline-flex items-center justify-center w-20 h-20 bg-white rounded-full shadow-sm border border-slate-200 mb-8">
                         <BarChart3 className="w-8 h-8 text-[#009FE3]" />
                    </div>
                    <h1 className="text-3xl font-black text-slate-900 font-condensed uppercase tracking-tight mb-4">Inncempro Market Intelligence</h1>
                    <p className="text-slate-500 text-base leading-relaxed mb-8">Welkom, <span className="font-bold text-slate-800">{currentUser.username}</span>. Toegang tot live data.<br/>Zoek architecten en aannemers in Nederland.</p>
                </div>
            )}

            {itemsToShow.length > 0 && (
                <div className="animate-fade-in space-y-6 max-w-6xl mx-auto w-full">
                    <div className="flex items-center justify-between border-b-2 border-slate-200 pb-4">
                        <div>
                             <h2 className="text-2xl font-black text-slate-900 font-condensed uppercase tracking-tight">
                                 {viewMode === 'search' ? 'Zoekresultaten' : 'Mijn Favorieten'}
                             </h2>
                             <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-wide">
                                 {viewMode === 'search' ? `~${totalMatches} gevonden` : `${favorites.length} opgeslagen`}
                             </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                        {currentItems.map(company => (
                            <div key={company.id}>
                                {enrichedData[company.id] ? (
                                    <IntelligenceCard content={enrichedData[company.id].content} onAction={handleDeepScanAction} isFavorite={favorites.some(f => f.id === company.id)} onToggleFavorite={() => toggleFavorite(company)} />
                                ) : (
                                    <SkeletonCard name={company.name} city={company.city} />
                                )}
                            </div>
                        ))}
                    </div>

                    {totalPages > 1 && (
                        <div className="flex justify-center items-center gap-2 py-8 border-t border-slate-200">
                             <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-2 border border-slate-200 rounded-sm hover:border-[#009FE3] disabled:opacity-50"><ChevronLeft className="w-4 h-4" /></button>
                             <span className="text-xs font-bold text-slate-500">Pagina {currentPage} van {totalPages}</span>
                             <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-2 border border-slate-200 rounded-sm hover:border-[#009FE3] disabled:opacity-50"><ChevronRight className="w-4 h-4" /></button>
                        </div>
                    )}
                    <SourcesList chunks={visibleChunks} />
                </div>
            )}
          </main>
      </div>

      {deepScanState.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm" onClick={closeDeepScan}>
              <div className="bg-[#F8FAFC] w-full max-w-4xl max-h-[90vh] shadow-2xl flex flex-col animate-fade-in" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-between p-6 bg-white border-b border-slate-200">
                      <div>
                        <div className="flex items-center gap-2 text-[#E85E26] text-[10px] font-bold uppercase tracking-[0.2em] mb-1"><Building className="w-3 h-3" /> Info Scan</div>
                        <h2 className="text-3xl font-black text-slate-900 font-condensed uppercase tracking-tight">{deepScanState.companyName}</h2>
                      </div>
                      <button onClick={closeDeepScan} className="p-2 hover:bg-slate-100 text-slate-400 hover:text-slate-900"><X className="w-6 h-6" /></button>
                  </div>
                  <div className="flex-grow overflow-y-auto p-8">
                      {deepScanState.isLoading ? (
                          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                              <Loader2 className="w-10 h-10 animate-spin mb-6 text-[#009FE3]" />
                              <p className="font-bold text-xs uppercase tracking-[0.2em]">Diepe Analyse Bezig...</p>
                          </div>
                      ) : deepScanState.error ? (
                          <div className="bg-red-50 p-8 text-center text-red-800"><p>{deepScanState.error}</p></div>
                      ) : (
                          <DeepScanReport placeData={deepScanState.placeData} />
                      )}
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

// Filter Component
const CollapsibleFilterGroup: React.FC<any> = ({ title, items, selectedItems, onToggleItem, searchable }) => {
    const [isOpen, setIsOpen] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const filteredItems = items.filter((item: string) => item.toLowerCase().includes(searchTerm.toLowerCase()));
    return (
        <div className="border border-slate-200 bg-white rounded-sm mb-4 last:mb-0 shadow-sm">
            <button onClick={() => setIsOpen(!isOpen)} className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 border-b border-slate-100 text-left">
                <span className="text-xs font-black text-slate-700 uppercase tracking-wider font-condensed">{title}</span>
                {isOpen ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
            </button>
            {isOpen && (
                <div className="p-4">
                    {searchable && (
                        <div className="relative mb-4">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                            <input type="text" placeholder="Zoek..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 text-xs focus:border-[#009FE3] focus:outline-none rounded-sm" />
                        </div>
                    )}
                    <div className={`space-y-2 ${searchable ? 'max-h-60 overflow-y-auto pr-2 scrollbar-thin' : ''}`}>
                        {filteredItems.map((item: string) => (
                            <label key={item} className="flex items-center gap-3 cursor-pointer group hover:opacity-80">
                                <div className={`w-4 h-4 border flex items-center justify-center ${selectedItems.includes(item) ? 'bg-[#E85E26] border-[#E85E26]' : 'bg-white border-slate-300'}`}>{selectedItems.includes(item) && <Check className="w-3 h-3 text-white" />}</div>
                                <span className={`text-sm ${selectedItems.includes(item) ? 'text-slate-900 font-bold' : 'text-slate-600 font-medium'}`}>{item}</span>
                                <input type="checkbox" className="hidden" checked={selectedItems.includes(item)} onChange={() => onToggleItem(item)} />
                            </label>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default App;
