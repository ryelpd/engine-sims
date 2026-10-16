import React, { useState } from 'react';
import V8Engine from './V8Engine.jsx';
import JetEngine from './JetEngine.jsx';
import { Cpu, Wind, Sun, Moon } from 'lucide-react';

export default function App() {
  const [activeEngine, setActiveEngine] = useState('v8'); // 'v8' | 'jet'
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('engine_theme') || 'dark';
  });

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('engine_theme', nextTheme);
  };

  const isDark = theme === 'dark';

  return (
    <div className={`relative w-full h-screen overflow-hidden select-none font-sans flex flex-col transition-colors duration-300 ${
      isDark ? 'bg-[#101828] text-gray-100' : 'bg-[#f8fafc] text-gray-900'
    }`}>
      {/* Top Main Navigation Bar (Erlangga Tutor Branding) */}
      <header className={`relative z-20 flex items-center justify-between px-4 py-2.5 border-b backdrop-blur-xl transition-colors duration-300 shrink-0 ${
        isDark ? 'bg-[#101828]/95 border-gray-800' : 'bg-white/95 border-gray-200 shadow-sm'
      }`}>
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-orange-500 flex items-center justify-center text-white shadow-[0_4px_12px_rgba(251,101,20,0.35)] shrink-0">
            {activeEngine === 'v8' ? (
              <Cpu className="w-5 h-5 text-white stroke-[2.2]" />
            ) : (
              <Wind className="w-5 h-5 text-white stroke-[2.2]" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm sm:text-base font-extrabold tracking-tight text-orange-500">
                ERLANGGA
              </span>
              <span className={`text-sm sm:text-base font-bold tracking-tight ${isDark ? 'text-white' : 'text-gray-900'}`}>
                PROPULSION LAB
              </span>
            </div>
            <p className={`text-[10px] hidden sm:block ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              Interactive 3D CAD & Mechanical Kinematics
            </p>
          </div>
        </div>

        {/* Engine Switcher Tabs */}
        <div className={`flex items-center p-1 rounded-xl border ${
          isDark ? 'bg-[#161f30] border-gray-800' : 'bg-gray-100 border-gray-200'
        }`}>
          <button
            onClick={() => setActiveEngine('v8')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95 ${
              activeEngine === 'v8'
                ? 'bg-orange-500 text-white shadow-[0_2px_8px_rgba(251,101,20,0.35)]'
                : isDark
                  ? 'text-gray-400 hover:text-white'
                  : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>V8 Engine</span>
          </button>

          <button
            onClick={() => setActiveEngine('jet')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95 ${
              activeEngine === 'jet'
                ? 'bg-orange-500 text-white shadow-[0_2px_8px_rgba(251,101,20,0.35)]'
                : isDark
                  ? 'text-gray-400 hover:text-white'
                  : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Wind className="w-3.5 h-3.5" />
            <span>Turbofan Jet</span>
          </button>
        </div>

        {/* Theme Mode Toggle Button */}
        <div className="flex items-center gap-2">
          <button
            onClick={toggleTheme}
            title={`Beralih ke mode ${isDark ? 'terang' : 'gelap'}`}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all active:scale-95 ${
              isDark
                ? 'bg-[#161f30] border-gray-700 text-orange-400 hover:bg-[#1f2c42]'
                : 'bg-orange-50 border-orange-200 text-orange-600 hover:bg-orange-100'
            }`}
          >
            {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{isDark ? 'Light' : 'Dark'}</span>
          </button>
        </div>
      </header>

      {/* Main Simulation Viewport (V8 or Jet Engine) */}
      <main className="relative flex-1 w-full h-[calc(100vh-53px)] overflow-hidden">
        {/* Ambient Glow Orbs */}
        <div 
          className={`pointer-events-none absolute -left-36 top-16 h-96 w-96 rounded-full blur-3xl z-0 transition-opacity duration-500 ${
            isDark ? 'bg-orange-500/10' : 'bg-orange-500/15'
          }`} 
          aria-hidden="true" 
        />
        <div 
          className={`pointer-events-none absolute -right-36 bottom-16 h-96 w-96 rounded-full blur-3xl z-0 transition-opacity duration-500 ${
            isDark ? 'bg-orange-600/5' : 'bg-orange-500/10'
          }`} 
          aria-hidden="true" 
        />

        {activeEngine === 'v8' ? (
          <V8Engine theme={theme} />
        ) : (
          <JetEngine theme={theme} />
        )}
      </main>
    </div>
  );
}
