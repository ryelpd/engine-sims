import React, { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import V8Engine from './V8Engine.jsx';
import JetEngine from './JetEngine.jsx';
import FourStrokeEngine from './FourStrokeEngine.jsx';
import DieselEngine from './DieselEngine.jsx';
import TwoStrokeEngine from './TwoStrokeEngine.jsx';
import RotaryEngine from './RotaryEngine.jsx';
import Landing from './Landing.jsx';
import { Cpu, Wind, Flame, Droplets, Repeat, Triangle, Sun, Moon } from 'lucide-react';

const engines = [
  { path: '/rotary', label: 'Rotary', icon: Triangle, Component: RotaryEngine },
  { path: '/2-stroke', label: '2-stroke', icon: Repeat, Component: TwoStrokeEngine },
  { path: '/diesel', label: 'Diesel', icon: Droplets, Component: DieselEngine },
  { path: '/4-stroke', label: '4-stroke', icon: Flame, Component: FourStrokeEngine },
  { path: '/v8', label: 'V8', icon: Cpu, Component: V8Engine },
  { path: '/turbofan', label: 'Turbofan', icon: Wind, Component: JetEngine }
];

export default function App() {
  const { pathname } = useLocation();
  const active = engines.find((engine) => engine.path === pathname);
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('engine_theme') || 'dark';
  });

  useEffect(() => {
    document.title = active ? `${active.label} · Erlangga` : 'Erlangga';
  }, [active]);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('engine_theme', nextTheme);
  };

  const isDark = theme === 'dark';
  const isLanding = pathname === '/';
  const hit = 'cursor-pointer text-base leading-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#fb6514]';

  if (isLanding) {
    return (
      <Routes>
        <Route path="/" element={<Landing />} />
      </Routes>
    );
  }

  return (
    <div className={`relative flex h-screen w-full select-none flex-col overflow-hidden font-sans ${
      isDark ? 'bg-[#101828] text-[#f2f4f7]' : 'bg-[#f8fafc] text-[#101828]'
    }`}>
      <header className="relative z-20 flex shrink-0 items-center gap-4 bg-white px-4 py-3 text-[#101828]">
        <NavLink
          to="/"
          className={`m-0 shrink-0 text-base font-semibold tracking-[-0.03em] text-[#101828] no-underline ${hit}`}
        >
          Erlangga
        </NavLink>
        <nav className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto" aria-label="Engine">
          {engines.map((engine) => {
            const Icon = engine.icon;
            return (
              <NavLink
                key={engine.path}
                to={engine.path}
                className={({ isActive }) => `inline-flex shrink-0 items-center gap-2 px-3 py-2 no-underline ${hit} ${
                  isActive ? 'bg-[#fb6514] text-[#101828]' : 'bg-[#eef1f4] text-[#101828] hover:bg-[#e2e7ec]'
                }`}
              >
                <Icon className="h-4 w-4" />
                {engine.label}
              </NavLink>
            );
          })}
        </nav>
        <button
          type="button"
          onClick={toggleTheme}
          className={`inline-flex shrink-0 items-center gap-2 bg-[#eef1f4] px-3 py-2 text-[#101828] hover:bg-[#e2e7ec] ${hit}`}
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          {isDark ? 'Light' : 'Dark'}
        </button>
      </header>

      <main className="relative w-full flex-1 overflow-hidden">
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

        <Routes>
          {engines.map((engine) => {
            const Engine = engine.Component;
            return (
              <Route
                key={engine.path}
                path={engine.path}
                element={<Engine theme={theme} />}
              />
            );
          })}
          <Route path="*" element={<Navigate to="/2-stroke" replace />} />
        </Routes>
      </main>
    </div>
  );
}
