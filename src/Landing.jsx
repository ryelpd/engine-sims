import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import './landing.css';

const machines = [
  {
    path: '/cvt',
    name: 'Steel CVT',
    spec: '2.60 - 0.45',
    image: '/lab/generated/v8.png',
    line: 'Van Doorne steel push-belt continuously variable transmission with hydraulic conical pulleys.'
  },
  {
    path: '/gearbox',
    name: 'Gearbox',
    spec: '5-Speed + R',
    image: '/lab/generated/v8.png',
    line: 'Constant-mesh manual transmission with synchromesh sleeves, shift forks, friction clutch, and reverse idler.'
  },
  {
    path: '/inline-5',
    name: 'Inline-5 2.5T',
    spec: '1-2-4-5-3',
    image: '/lab/generated/four-stroke.png',
    line: 'Five cylinders in a row, 144° crank intervals, 20 DOHC valves, and a single-scroll turbocharger.'
  },
  {
    path: '/rotary',
    name: 'Rotary',
    spec: '1080°',
    image: '/lab/generated/two-stroke.png',
    line: 'A Reuleaux rotor orbits inside an epitrochoid chamber. Three shaft turns per rotor revolution.'
  },
  {
    path: '/2-stroke',
    name: '2-stroke',
    spec: '360°',
    image: '/lab/generated/two-stroke.png',
    line: 'One revolution. Mixture enters through a reed valve and rises in a Schnürle loop.'
  },
  {
    path: '/diesel',
    name: 'Diesel',
    spec: '48 bar',
    image: '/lab/generated/diesel.png',
    line: 'Two revolutions. Fuel is injected into hot air and auto-ignites. No spark plug.'
  },
  {
    path: '/4-stroke',
    name: '4-stroke',
    spec: '11.5:1',
    image: '/lab/generated/four-stroke.png',
    line: 'A spark fires the mixture in a 498 cc cylinder. Compression is 11.5 to 1.'
  },
  {
    path: '/v8',
    name: 'V8',
    spec: '1-8-4-3-6-5-7-2',
    image: '/lab/generated/v8.png',
    line: 'Cross-plane crank, 90° bank. The firing order runs 1-8-4-3-6-5-7-2.'
  },
  {
    path: '/turbofan',
    name: 'Turbofan',
    spec: '168 kN',
    image: '/lab/generated/turbofan.png',
    line: 'Twin spool. N1 turns the fan. N2 turns the core. 115 kN dry, 168 kN in afterburner.'
  }
];

const stages = [
  {
    name: 'Assembled',
    image: '/lab/generated/assembled.png',
    text: 'The case is closed. Block, head and covers read as one casting.'
  },
  {
    name: 'Cut',
    image: '/lab/generated/cut.png',
    text: 'A 180° section opens the bore, the valves and the chamber.'
  },
  {
    name: 'Exploded',
    image: '/lab/generated/exploded.png',
    text: 'Head, block and the rotating parts step apart along the build axis.'
  }
];

export default function Landing() {
  const [picked, setPicked] = useState(0);
  const [hover, setHover] = useState(null);
  const shown = hover ?? picked;
  const machine = machines[picked];
  const inkField = picked % 2 === 1;

  useEffect(() => {
    const nodes = document.querySelectorAll('.landing [data-reveal]');
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-in');
        observer.unobserve(entry.target);
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.15 });
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="landing">
      <section className="hero" aria-label="Engines">
        <header className="top">
          <Link to="/" className="word">Erlangga</Link>
          <nav aria-label="Engine">
            {machines.map((item) => (
              <Link key={item.path} to={item.path}>{item.name}</Link>
            ))}
          </nav>
        </header>

        <div className="hero-copy">
          <h1 className="lines">
            <span className="line"><span data-line style={{ '--i': 0 }}>Open an</span></span>
            <span className="line"><span data-line style={{ '--i': 1 }}>engine</span></span>
          </h1>
          <p className="hero-lead" data-rise style={{ '--i': 2 }}>
            Five simulations you can cut open and run, from a reed-valve two-stroke to a twin-spool turbofan.
          </p>
        </div>

        <div
          className="index"
          onMouseLeave={() => setHover(null)}
        >
          {machines.map((item, index) => (
            <Link
              key={item.path}
              to={item.path}
              className="index-row"
              data-rise
              style={{ '--i': index + 3 }}
              onMouseEnter={() => setHover(index)}
              onFocus={() => setHover(index)}
              onBlur={() => setHover(null)}
            >
              <img className="inline-bore" src={item.image} alt="" width="40" height="40" />
              <span className="dot" aria-hidden="true" />
              {item.name}
            </Link>
          ))}
        </div>

        <div className="bore" aria-hidden="true">
          {machines.map((item, index) => (
            <img
              key={item.path}
              src={item.image}
              alt=""
              width="960"
              height="960"
              className={shown === index ? 'is-on' : undefined}
            />
          ))}
        </div>
      </section>

      <section className={`showcase${inkField ? ' is-ink' : ''}`} aria-label="Choose an engine">
        <h2 data-reveal style={{ '--i': 0 }}>Open the {machine.name}</h2>
        <p className="showcase-lead" data-reveal style={{ '--i': 1 }}>{machine.line}</p>
        <div className="switch" data-ui data-reveal style={{ '--i': 2 }} role="group" aria-label="Engine">
          {machines.map((item, index) => (
            <button
              key={item.path}
              type="button"
              aria-pressed={picked === index}
              onClick={() => setPicked(index)}
            >
              <img src={item.image} alt="" />
              <span>{item.name}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="work" aria-label="Inside the case">
        <div className="work-grid">
          <h2 data-reveal>Inside the case</h2>
          {stages.map((stage, index) => (
            <article key={stage.name} className="stage" data-reveal style={{ '--i': index + 1 }}>
              <div className="tile">
                <img src={stage.image} alt="" width="800" height="800" />
              </div>
              <h3>{stage.name}</h3>
              <p>{stage.text}</p>
            </article>
          ))}
        </div>
      </section>

      <div className="seam" aria-hidden="true">
        <div className="seam-bore">
          <img src="/lab/generated/v8.png" alt="" width="640" height="640" />
        </div>
      </div>

      <section className="close" aria-label="Start">
        <h2 className="lines">
          <span className="line"><span data-line data-reveal style={{ '--i': 0 }}>Leave one</span></span>
          <span className="line"><span data-line data-reveal style={{ '--i': 1 }}>running</span></span>
        </h2>
        <div className="close-bar">
          <p data-reveal style={{ '--i': 2 }}>The crank is already turning when the simulation opens.</p>
          <Link className="enter" to={machine.path} data-reveal style={{ '--i': 3 }}>
            Open {machine.name}
          </Link>
        </div>
        <p className="giant" data-reveal>Erlangga</p>
        <p className="credit">
          The pictures are generated renders of the engines in this lab.
        </p>
      </section>
    </div>
  );
}
