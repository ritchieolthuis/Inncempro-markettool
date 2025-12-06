
import React from 'react';
import { Globe, MapPin, Mail, Phone, Users, ScanSearch, Star, MessageSquare, Linkedin, ArrowUpRight, CheckCircle2, HardHat, PenTool, Loader2, Heart, Building2 } from 'lucide-react';
import { PlaceResult } from '../services/googleMapsService'; 

export interface MarkdownDisplayProps {
    content: string;
    onAction?: (action: string, value: string) => void;
    isFavorite?: boolean;
    onToggleFavorite?: () => void;
}

export const IntelligenceCard: React.FC<MarkdownDisplayProps> = ({ content, onAction, isFavorite, onToggleFavorite }) => {
    const lines = content.trim().split('\n');
    const title = lines[0].replace(/###/g, '').trim().replace(/\*\*/g, '');
    const bodyLines = lines.slice(1);

    let address = "";
    let rating = "";
    let profileData: { label: string, value: string, type: 'text' | 'tag' }[] = [];
    const actionButtons: React.ReactNode[] = [];
    
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;

    const cleanText = (text: string) => {
        return text
            .replace(/\*\*/g, '')
            .replace(/\_\_/g, '')
            .replace(/\*/g, '')
            .replace(/^\s*[-•]\s*/, '')
            .replace(/--/g, '')
            .replace(/\/\//g, '')
            .trim();
    };
    
    bodyLines.forEach(line => {
        const lowerLine = line.toLowerCase();
        
        if (line.trim().startsWith('LINKS:') || line.trim().startsWith('Links:')) {
            let match;
            while ((match = linkRegex.exec(line)) !== null) {
                const label = match[1];
                const url = match[2];
                const lowerLabel = label.toLowerCase();
                const isInvalid = !url || url.toLowerCase() === 'n/a' || url.toLowerCase() === 'na' || url.length < 3;

                if (isInvalid) continue;

                const baseBtnClass = "flex items-center justify-center gap-2 px-3 py-2 text-[10px] font-bold uppercase tracking-wider border transition-all flex-1 whitespace-nowrap font-condensed rounded-sm";
                
                if (url.startsWith('action:deepscan:')) {
                    const companyName = url.replace('action:deepscan:', '');
                    actionButtons.push(
                        <button key="deepscan" onClick={() => onAction && onAction('deepscan', companyName)} 
                            className={`${baseBtnClass} bg-[#009FE3] text-white border-[#009FE3] hover:bg-[#008ac5] min-w-[120px] shadow-sm`}>
                            <ScanSearch className="w-3 h-3" /> Info Scan
                        </button>
                    );
                } else if (lowerLabel.includes('website')) {
                     actionButtons.push(
                        <a key="web" href={url} target="_blank" rel="noreferrer" className={`${baseBtnClass} bg-white text-slate-700 border-slate-200 hover:border-[#009FE3] hover:text-[#009FE3]`}>
                            <Globe className="w-3 h-3" /> Site
                        </a>
                    );
                } else if (lowerLabel.includes('route')) {
                     actionButtons.push(
                        <a key="route" href={url} target="_blank" rel="noreferrer" className={`${baseBtnClass} bg-white text-slate-700 border-slate-200 hover:border-[#E85E26] hover:text-[#E85E26]`}>
                            <MapPin className="w-3 h-3" /> Route
                        </a>
                    );
                } else if (lowerLabel.includes('bel')) {
                    actionButtons.push(
                        <a key="call" href={url} className={`${baseBtnClass} bg-white text-slate-700 border-slate-200 hover:border-slate-900 hover:text-slate-900`}>
                            <Phone className="w-3 h-3" /> Tel
                        </a>
                    );
                }
            }
            return;
        }

        if (lowerLine.includes('adres:') || lowerLine.includes('address:')) {
            const rawAddr = line.replace(/\*?\*?Adres:?\*?\*?/i, '').replace('Adres:', '');
            address = cleanText(rawAddr);
            if (address.toLowerCase() === 'n/a' || address.toLowerCase() === 'zie google maps') address = "";
        } 
        else if (lowerLine.includes('rating:')) {
            const rawRating = line.replace(/\*?\*?Rating:?\*?\*?/i, '').replace('Rating:', '');
            rating = cleanText(rawRating);
            if (rating.toLowerCase() === 'n/a') rating = "";
        } 
        else if (line.trim().startsWith('*') || line.trim().startsWith('-')) {
            let cleanLine = line.replace(/^\s*[\*\-]\s*/, '').trim();
            if (cleanLine.toLowerCase().includes('google summary:') || cleanLine.toLowerCase().includes('google samenvatting:')) return;

            if (cleanLine.toLowerCase().startsWith('focus:') || cleanLine.toLowerCase().startsWith('tags:')) {
                const tags = cleanLine.replace(/Focus:|Tags:/i, '').split(',').map(t => cleanText(t));
                tags.forEach(tag => {
                   if(tag && tag.toLowerCase() !== 'n/a') profileData.push({ label: 'Tag', value: tag, type: 'tag' });
                });
            }
        }
    });

    const tags = profileData.filter(d => d.type === 'tag');

    return (
        <div className="bg-white border border-slate-200 shadow-sm flex flex-col h-full animate-fade-in hover:border-[#009FE3] transition-all rounded-sm relative overflow-hidden group">
            <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-start bg-white">
                <div className="min-w-0 flex-1 pr-4">
                    <h3 className="font-black text-slate-900 text-lg uppercase tracking-tight font-condensed truncate" title={title}>{title}</h3>
                    {address && <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5 truncate"><MapPin className="w-3 h-3 text-[#E85E26]"/> {address}</p>}
                </div>
                <div className="flex flex-col items-end flex-shrink-0 gap-2">
                    <div className="flex items-center gap-2">
                        {rating && (
                            <div className="flex flex-col items-end">
                                <div className="flex text-amber-500 gap-0.5">
                                    {[...Array(5)].map((_, i) => (
                                        <Star key={i} className="w-3 h-3 fill-current" />
                                    ))}
                                </div>
                                <span className="text-[10px] font-bold text-slate-400 mt-0.5 font-condensed">{rating}</span>
                            </div>
                        )}
                        <button 
                            onClick={onToggleFavorite}
                            className={`p-1.5 rounded-full border transition-colors ${isFavorite ? 'bg-red-50 border-red-200 text-red-500' : 'bg-white border-slate-200 text-slate-300 hover:text-red-400 hover:border-red-200'}`}
                            title={isFavorite ? "Verwijder uit favorieten" : "Toevoegen aan favorieten"}
                        >
                            <Heart className={`w-4 h-4 ${isFavorite ? 'fill-current' : ''}`} />
                        </button>
                    </div>
                </div>
            </div>

            <div className="p-5 flex-grow flex flex-col gap-4">
                {tags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        {tags.map((tag, i) => (
                            <span key={i} className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold bg-slate-50 text-slate-600 border border-slate-200 uppercase tracking-wide font-condensed rounded-sm">
                                {tag.value}
                            </span>
                        ))}
                    </div>
                )}
            </div>

            <div className="p-4 bg-white border-t border-slate-100 mt-auto">
                <div className="flex flex-wrap gap-2">
                    {actionButtons}
                </div>
            </div>
        </div>
    );
};

export const SkeletonCard: React.FC<{ name: string; city: string }> = ({ name, city }) => (
     <div className="bg-white border border-slate-100 shadow-sm flex flex-col h-full rounded-sm relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-slate-100 animate-pulse">
            <div className="h-full bg-[#009FE3]/50 w-1/3 animate-[shimmer_1.5s_infinite]"></div>
        </div>
        <div className="px-5 py-4 border-b border-slate-50">
            <h3 className="font-black text-slate-800 text-lg uppercase tracking-tight font-condensed truncate opacity-50">{name}</h3>
            <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5"><MapPin className="w-3 h-3"/> {city}</p>
        </div>
        <div className="p-5 flex-grow space-y-4">
             <div className="flex gap-2">
                 <div className="h-5 w-16 bg-slate-100 rounded-sm animate-pulse"></div>
                 <div className="h-5 w-20 bg-slate-100 rounded-sm animate-pulse"></div>
             </div>
             <div className="bg-slate-50 p-3 h-24 rounded-sm animate-pulse"></div>
        </div>
        <div className="p-4 border-t border-slate-50 flex gap-2">
            <div className="h-8 flex-1 bg-slate-100 rounded-sm animate-pulse"></div>
            <div className="h-8 flex-1 bg-slate-100 rounded-sm animate-pulse"></div>
        </div>
        <div className="absolute inset-0 flex items-center justify-center bg-white/50 backdrop-blur-[1px]">
             <div className="flex items-center gap-2 text-xs font-bold text-[#009FE3] uppercase tracking-wider bg-white px-3 py-1.5 rounded-full shadow-sm border border-slate-100">
                <Loader2 className="w-3 h-3 animate-spin" /> Verrijken...
             </div>
        </div>
     </div>
);

// ... DeepScanReport remains mostly unchanged but ensuring Dutch labels ...
interface InfoScanResult extends PlaceResult {
    review_source?: string;
}

export const DeepScanReport: React.FC<{ placeData: InfoScanResult }> = ({ placeData }) => {
    if (!placeData) return null;
    const hasRating = typeof placeData.rating === 'number';

    return (
        <div className="space-y-8 font-sans">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-[#009FE3] p-6 text-white flex flex-col justify-between shadow-lg relative overflow-hidden h-48 border-l-8 border-[#007bb0] rounded-sm">
                    <div className="absolute right-0 top-0 opacity-10">
                        <Star className="w-48 h-48 -mr-10 -mt-10" />
                    </div>
                    <div>
                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] mb-2 text-blue-100 font-condensed">Geverifieerde Google Score</h4>
                        <div className="flex items-baseline gap-3">
                             <div className="text-6xl font-black font-condensed leading-none">{hasRating ? placeData.rating : '-'}</div>
                             <div className="flex flex-col">
                                 <div className="flex text-amber-400 gap-1 mb-1">
                                     {[...Array(5)].map((_, i) => (
                                         <Star key={i} className={`w-4 h-4 ${hasRating && i < Math.round(placeData.rating!) ? 'fill-current' : 'opacity-40'}`} />
                                     ))}
                                 </div>
                                 <span className="text-sm font-medium opacity-90">{placeData.user_ratings_total || 0} reviews</span>
                             </div>
                        </div>
                    </div>
                    <div className="mt-auto pt-4 border-t border-white/20">
                         <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider font-condensed">
                            <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                            Bron: {placeData.review_source || 'Google Maps'}
                         </div>
                    </div>
                </div>

                <div className="md:col-span-2 bg-white border border-slate-200 p-6 flex gap-6 shadow-sm rounded-sm">
                    <div className="flex-1 space-y-6">
                        <div className="border-b border-slate-100 pb-4">
                            <span className="text-[10px] font-bold text-[#E85E26] uppercase tracking-[0.2em] block mb-1 font-condensed">Bedrijfsprofiel</span>
                            <h3 className="text-2xl font-black text-slate-900 font-condensed uppercase">{placeData.name}</h3>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-6">
                            <div>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1 font-condensed">Hoofdkantoor</span>
                                <span className="text-sm font-medium text-slate-800 flex items-start gap-2">
                                    <MapPin className="w-4 h-4 text-slate-400 mt-0.5" />
                                    {placeData.formatted_address || 'N/A'}
                                </span>
                            </div>
                            <div className="space-y-2">
                                {placeData.website && (
                                    <a href={placeData.website} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm font-bold text-[#009FE3] hover:underline uppercase tracking-wide font-condensed">
                                        <Globe className="w-4 h-4" /> Bezoek Website
                                    </a>
                                )}
                                {placeData.formatted_phone_number && (
                                     <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                                        <Phone className="w-4 h-4 text-slate-400" /> {placeData.formatted_phone_number}
                                     </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* NEW: Branches Section */}
            {placeData.branches && placeData.branches.length > 0 && (
                <div className="bg-white border border-slate-200 shadow-sm rounded-sm p-6">
                    <h3 className="font-bold text-lg font-condensed uppercase text-slate-800 flex items-center gap-2 mb-4">
                        <Building2 className="w-5 h-5 text-slate-500" />
                        Vestigingen (Nederland & Benelux)
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {placeData.branches.map((branch, i) => (
                            <div key={i} className={`p-3 border rounded-sm ${branch.isHeadOffice ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-100'}`}>
                                <div className="flex items-center gap-2 mb-1">
                                    {branch.isHeadOffice && <span className="text-[9px] font-black uppercase text-white bg-[#009FE3] px-1.5 py-0.5 rounded-sm">HQ</span>}
                                    <span className="text-sm font-bold text-slate-800">{branch.city}</span>
                                </div>
                                <p className="text-xs text-slate-500">{branch.address}</p>
                                <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">{branch.country}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                 <div className="bg-white border border-slate-200 shadow-sm rounded-sm p-6">
                    <h3 className="font-bold text-lg font-condensed uppercase text-slate-800 flex items-center gap-2 mb-4">
                        <Users className="w-5 h-5 text-[#E85E26]" />
                        Team & Sleutelfiguren
                    </h3>
                    <div className="space-y-3">
                        {placeData.team_members && placeData.team_members.length > 0 ? (
                            placeData.team_members.map((member, i) => (
                                <div key={i} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 rounded-sm">
                                    <div>
                                        <p className="text-sm font-bold text-slate-900">{member.name}</p>
                                        <p className="text-xs text-[#009FE3] font-medium uppercase font-condensed">{member.role}</p>
                                    </div>
                                    <div className="flex gap-2">
                                        {member.email && <a href={`mailto:${member.email}`} className="p-1.5 bg-white border border-slate-200 text-slate-500 hover:text-[#009FE3]"><Mail className="w-3 h-3"/></a>}
                                        {member.phone && <a href={`tel:${member.phone}`} className="p-1.5 bg-white border border-slate-200 text-slate-500 hover:text-[#009FE3]"><Phone className="w-3 h-3"/></a>}
                                    </div>
                                </div>
                            ))
                        ) : (
                            <p className="text-sm text-slate-400 italic">Geen specifieke teamleden gevonden in publieke bronnen.</p>
                        )}
                    </div>
                 </div>

                 <div className="bg-white border border-slate-200 shadow-sm rounded-sm p-6">
                    <h3 className="font-bold text-lg font-condensed uppercase text-slate-800 flex items-center gap-2 mb-4">
                        <HardHat className="w-5 h-5 text-[#009FE3]" />
                        Gerealiseerde Projecten
                    </h3>
                    <div className="space-y-3">
                         {placeData.recent_projects && placeData.recent_projects.length > 0 ? (
                            placeData.recent_projects.map((project, i) => (
                                <div key={i} className="flex items-start gap-3 p-3 border-b border-slate-50 last:border-0">
                                    <PenTool className="w-4 h-4 text-slate-300 mt-1 flex-shrink-0" />
                                    <div>
                                        <p className="text-sm font-bold text-slate-900">{project.name} <span className="text-xs font-normal text-slate-400 ml-1">{project.year}</span></p>
                                        <p className="text-xs text-slate-600 mt-0.5">{project.description}</p>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <p className="text-sm text-slate-400 italic">Geen recente projectdata beschikbaar.</p>
                        )}
                    </div>
                 </div>
            </div>

            <div className="bg-white border border-slate-200 shadow-sm rounded-sm">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="font-bold text-lg font-condensed uppercase text-slate-800 flex items-center gap-2">
                        <MessageSquare className="w-5 h-5 text-[#E85E26]" />
                        Recente Beoordelingen
                    </h3>
                    <a href={placeData.url} target="_blank" rel="noreferrer" className="text-xs font-bold text-slate-400 hover:text-[#009FE3] flex items-center gap-1 uppercase tracking-wider font-condensed">
                        Bekijk op Google <ArrowUpRight className="w-3 h-3" />
                    </a>
                </div>
                <div className="divide-y divide-slate-100">
                     {placeData.reviews && placeData.reviews.length > 0 ? (
                         placeData.reviews.map((review, i) => (
                             <div key={i} className="p-6 hover:bg-slate-50 transition-colors">
                                 <div className="flex items-center justify-between mb-2">
                                     <span className="text-xs font-black text-slate-900 uppercase tracking-wide font-condensed">{review.author_name}</span>
                                     <span className="text-[10px] text-slate-400 font-bold uppercase font-condensed">{review.relative_time_description}</span>
                                 </div>
                                 <div className="flex text-amber-400 mb-2">
                                     {[...Array(5)].map((_, r) => (
                                         <Star key={r} className={`w-3 h-3 ${r < review.rating ? 'fill-current' : 'opacity-30'}`} />
                                     ))}
                                 </div>
                                 <p className="text-sm text-slate-600 leading-relaxed">"{review.text}"</p>
                             </div>
                         ))
                     ) : (
                         <div className="p-8 text-center text-slate-400 text-sm font-medium italic">
                             Geen tekstuele reviews beschikbaar in de preview.
                         </div>
                     )}
                </div>
            </div>
        </div>
    );
};
