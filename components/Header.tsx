
import React, { useState } from 'react';
import { User as UserIcon, LogOut, Settings, ChevronDown } from 'lucide-react';
import { User } from '../types';

interface HeaderProps {
  onHomeClick?: () => void;
  user?: User;
  onLogout?: () => void;
  onOpenSettings?: () => void;
}

const Header: React.FC<HeaderProps> = ({ onHomeClick, user, onLogout, onOpenSettings }) => {
  const [showDropdown, setShowDropdown] = useState(false);

  return (
    <header className="bg-white border-b-2 border-[#009FE3] sticky top-0 z-30 h-28 flex items-center shadow-md">
      <div className="max-w-[1400px] w-full mx-auto px-6 lg:px-10 flex justify-between items-center h-full">
        
        {/* Brand Logo */}
        <button onClick={onHomeClick} className="flex items-center gap-6 group focus:outline-none h-full">
             <img 
                src="https://www.inncempro.nl/wp-content/uploads/2018/06/Logo-Inncempro-facebook.png" 
                alt="Inncempro Logo" 
                className="w-20 h-20 object-contain"
            />
            <div className="flex flex-col justify-center text-left border-l border-slate-200 pl-6 h-12">
                <span className="text-3xl font-bold text-[#009FE3] tracking-tight leading-none font-condensed uppercase transition-colors">
                    inncempro
                </span>
                <span className="text-xs text-[#E85E26] font-normal tracking-[0.2em] uppercase mt-1 font-condensed">
                    Market Intelligence
                </span>
            </div>
        </button>

        {/* User Profile & Status */}
        <div className="flex items-center gap-6">
            <div className="hidden md:flex flex-col text-right">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-condensed">Databron</span>
                <span className="text-sm font-bold text-slate-700 font-condensed">GOOGLE LIVE INDEX</span>
            </div>
            
            <div className="h-10 w-px bg-slate-200 hidden md:block"></div>

            {user ? (
                <div className="relative">
                    <button 
                        onClick={() => setShowDropdown(!showDropdown)}
                        className="flex items-center gap-3 hover:bg-slate-50 p-2 rounded-lg transition-colors border border-transparent hover:border-slate-100"
                    >
                        <div className="flex flex-col text-right hidden sm:flex">
                            <span className="text-sm font-bold text-slate-900 leading-tight">{user.username}</span>
                            <span className="text-[10px] text-slate-500 font-medium truncate max-w-[100px]">{user.email}</span>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-slate-100 overflow-hidden border border-slate-200">
                            {user.avatarUrl ? (
                                <img src={user.avatarUrl} alt={user.username} className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-slate-400">
                                    <UserIcon className="w-5 h-5" />
                                </div>
                            )}
                        </div>
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                    </button>

                    {showDropdown && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)}></div>
                            <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-sm shadow-xl border border-slate-200 z-50 py-2 animate-fade-in">
                                <button onClick={() => { onOpenSettings?.(); setShowDropdown(false); }} className="w-full text-left px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2 font-medium">
                                    <Settings className="w-4 h-4 text-slate-400" /> Instellingen
                                </button>
                                <div className="h-px bg-slate-100 my-1"></div>
                                <button onClick={() => { onLogout?.(); setShowDropdown(false); }} className="w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 font-medium">
                                    <LogOut className="w-4 h-4" /> Uitloggen
                                </button>
                            </div>
                        </>
                    )}
                </div>
            ) : (
                <div className="flex items-center gap-2 px-4 py-1.5 bg-emerald-50/50 border border-emerald-100 rounded-sm">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                    <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider font-condensed">Online</span>
                </div>
            )}
        </div>
      </div>
    </header>
  );
};

export default Header;
