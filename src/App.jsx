import React, { useEffect, useRef, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import V8Engine from './V8Engine.jsx';
import JetEngine from './JetEngine.jsx';
import FourStrokeEngine from './FourStrokeEngine.jsx';
import DieselEngine from './DieselEngine.jsx';
import TwoStrokeEngine from './TwoStrokeEngine.jsx';
import RotaryEngine from './RotaryEngine.jsx';
import Inline5Engine from './Inline5Engine.jsx';
import Flat6Engine from './Flat6Engine.jsx';
import GearboxSim from './GearboxSim.jsx';
import CvtSim from './CvtSim.jsx';
import DifferentialSim from './DifferentialSim.jsx';
import Landing from './Landing.jsx';
import { ChevronDown, Cpu, Wind, Flame, Droplets, Repeat, Triangle, Gauge, MoveHorizontal, Cog, Infinity as InfinityIcon, GitFork, Sun, Moon } from 'lucide-react';

const engines = [
  { path: '/2-stroke', label: '2-stroke', group: 'Engines', icon: Repeat, Component: TwoStrokeEngine },
  { path: '/4-stroke', label: '4-stroke', group: 'Engines', icon: Flame, Component: FourStrokeEngine },
  { path: '/diesel', label: 'Diesel', group: 'Engines', icon: Droplets, Component: DieselEngine },
  { path: '/rotary', label: 'Rotary', group: 'Engines', icon: Triangle, Component: RotaryEngine },
  { path: '/inline-5', label: 'Inline-5 2.5T', group: 'Engines', icon: Gauge, Component: Inline5Engine },
  { path: '/flat-6', label: 'Flat-6 Boxer', group: 'Engines', icon: MoveHorizontal, Component: Flat6Engine },
  { path: '/v8', label: 'V8', group: 'Engines', icon: Cpu, Component: V8Engine },
  { path: '/turbofan', label: 'Turbofan', group: 'Engines', icon: Wind, Component: JetEngine },
  { path: '/gearbox', label: 'Gearbox', group: 'Drivetrain', icon: Cog, Component: GearboxSim },
  { path: '/cvt', label: 'Steel CVT', group: 'Drivetrain', icon: InfinityIcon, Component: CvtSim },
  { path: '/differential', label: 'Differential & LSD', group: 'Drivetrain', icon: GitFork, Component: DifferentialSim }
];

const groups = ['Engines', 'Drivetrain'];

export default function App() {
  const { pathname } = useLocation();
  const active = engines.find((engine) => engine.path === pathname);
  const headerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('engine_theme') || 'dark';
  });

  useEffect(() => {
    document.title = active ? `${active.label} · Erlangga` : 'Erlangga';
  }, [active]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onPointer = (event) => {
      if (!headerRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('engine_theme', nextTheme);
  };

  const isDark = theme === 'dark';
  const isLanding = pathname === '/';
  const ActiveIcon = active?.icon;
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
      <header ref={headerRef} className="relative z-30 flex shrink-0 items-center gap-2 bg-white px-4 py-3 text-[#101828]">
        <NavLink
          to="/"
          className={`m-0 shrink-0 text-base font-semibold tracking-[-0.03em] text-[#101828] no-underline ${hit}`}
        >
          Erlangga
        </NavLink>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="simulation-menu"
          onClick={() => setOpen((value) => !value)}
          className={`inline-flex min-w-0 max-w-[58%] items-center gap-2 px-3 py-2 sm:max-w-none ${hit} ${
            open ? 'bg-[#101828] text-white' : 'bg-[#eef1f4] text-[#101828] hover:bg-[#e2e7ec]'
          }`}
        >
          {ActiveIcon ? <ActiveIcon className="h-4 w-4 shrink-0" /> : null}
          <span className="min-w-0 truncate">{active ? active.label : 'Simulations'}</span>
          <ChevronDown className={`h-4 w-4 shrink-0 ${open ? 'rotate-180' : ''}`} />
        </button>
        <div className="min-w-0 flex-1" />
        <button
          type="button"
          onClick={toggleTheme}
          className={`inline-flex shrink-0 items-center gap-2 bg-[#eef1f4] px-3 py-2 text-[#101828] hover:bg-[#e2e7ec] ${hit}`}
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          {isDark ? 'Light' : 'Dark'}
        </button>
        {open ? (
          <nav
            id="simulation-menu"
            aria-label="Simulations"
            className="absolute left-0 right-0 top-full grid max-h-[min(70vh,36rem)] gap-6 overflow-y-auto bg-white p-4 sm:grid-cols-2"
          >
            {groups.map((group) => (
              <section key={group}>
                <h2 className="m-0 mb-2 text-base font-semibold">{group}</h2>
                <div className="grid gap-2">
                  {engines.filter((engine) => engine.group === group).map((engine) => {
                    const Icon = engine.icon;
                    return (
                      <NavLink
                        key={engine.path}
                        to={engine.path}
                        className={({ isActive }) => `flex items-center gap-3 px-3 py-3 no-underline ${hit} ${
                          isActive ? 'bg-[#101828] text-white' : 'bg-[#eef1f4] text-[#101828] hover:bg-[#e2e7ec]'
                        }`}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        {engine.label}
                      </NavLink>
                    );
                  })}
                </div>
              </section>
            ))}
          </nav>
        ) : null}
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
