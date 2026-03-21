import { useState, useRef, useEffect, useCallback } from "react";
import { storage } from "./storage";
import { findRestaurant } from "./api";

const CUISINES = [
  { id: "pizza",         label: "Pizza",            emoji: "🍕" },
  { id: "sushi",         label: "Sushi",            emoji: "🍣" },
  { id: "mexican",       label: "Mexican",          emoji: "🌮" },
  { id: "thai",          label: "Thai",             emoji: "🍜" },
  { id: "indian",        label: "Indian",           emoji: "🍛" },
  { id: "chinese",       label: "Chinese",          emoji: "🥟" },
  { id: "burgers",       label: "Burgers",          emoji: "🍔" },
  { id: "mediterranean", label: "Mediterranean",    emoji: "🥙" },
  { id: "korean",        label: "Korean",           emoji: "🥢" },
  { id: "ramen",         label: "Ramen",            emoji: "🍱" },
  { id: "italian",       label: "Italian",          emoji: "🍝" },
  { id: "bbq",           label: "BBQ",              emoji: "🍖" },
  { id: "vietnamese",    label: "Vietnamese",       emoji: "🍲" },
  { id: "greek",         label: "Greek",            emoji: "🫒" },
  { id: "american",      label: "Diner / American", emoji: "🥞" },
  { id: "wings",         label: "Wings",            emoji: "🍗" },
];

const VERDICTS = [
  "The algorithm has spoken. Argument over.",
  "Stop debating. Start eating.",
  "Science has decided. Trust the process.",
  "Your stomach called. This is its answer.",
  "Neither of you would've agreed anyway. You're welcome.",
  "Democracy is dead. This is better.",
  "Statistically optimal. Emotionally valid. Done.",
  "Debating is for people who aren't hungry yet.",
  "Fate, hunger, and math. All pointing here.",
];

const HISTORY_KEY   = "wwe-history";
const FAVORITES_KEY = "wwe-favorites";
const AVOID_LAST_N  = 3;
const MAX_SAVED     = 3;

function formatTime(ts) {
  const diffMs   = Date.now() - ts;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHrs  = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1)  return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHrs  < 24) return `${diffHrs}h ago`;
  if (diffDays < 7)  return `${diffDays}d ago`;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function decide(p1, p2, recentCuisineIds = []) {
  const excluded   = new Set(recentCuisineIds.slice(0, AVOID_LAST_N));
  const filterPool = ids => { const f = ids.filter(id => !excluded.has(id)); return f.length > 0 ? f : ids; };
  const overlap    = filterPool(p1.cuisines.filter(c => p2.cuisines.includes(c)));
  const p1f        = filterPool(p1.cuisines);
  const p2f        = filterPool(p2.cuisines);
  let chosen, wasCompromise = false;
  if (overlap.length > 0) {
    chosen = CUISINES.find(c => c.id === overlap[Math.floor(Math.random() * overlap.length)]);
  } else {
    const all = [...new Set([...p1f, ...p2f])];
    wasCompromise = p1.cuisines.length > 0 && p2.cuisines.length > 0;
    if (all.length > 0) {
      chosen = CUISINES.find(c => c.id === all[Math.floor(Math.random() * all.length)]);
    } else {
      const safe = CUISINES.filter(c => !excluded.has(c.id));
      const pool = safe.length > 0 ? safe : CUISINES;
      chosen = pool[Math.floor(Math.random() * pool.length)];
    }
  }
  return {
    cuisine: chosen, wasCompromise,
    verdict: VERDICTS[Math.floor(Math.random() * VERDICTS.length)],
    timestamp: Date.now(),
  };
}

function PersonPanel({ person, setPerson, label, color, bg }) {
  const toggle = id => setPerson(p => ({
    ...p,
    cuisines: p.cuisines.includes(id) ? p.cuisines.filter(c => c !== id) : [...p.cuisines, id],
  }));
  const chip = a => ({
    padding: "5px 11px", borderRadius: "20px",
    border: `1px solid ${a ? color : "#252534"}`,
    background: a ? bg : "transparent",
    color: a ? color : "#484860",
    cursor: "pointer", fontSize: "0.81rem",
    fontFamily: "'DM Sans',sans-serif", transition: "all .15s",
  });
  const lbl = { color: "#303048", fontSize: "0.67rem", letterSpacing: "0.2em", marginBottom: "9px", fontFamily: "'DM Sans',sans-serif" };
  return (
    <div style={{ flex: 1, minWidth: "270px", padding: "22px", borderRadius: "16px", background: "rgba(255,255,255,0.022)", border: `1px solid ${color}20`, boxShadow: `inset 0 0 60px ${color}06` }}>
      <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "2.1rem", color, letterSpacing: "0.12em", textShadow: `0 0 22px ${color}55`, marginBottom: "20px" }}>{label}</div>
      <div style={lbl}>WHAT ARE YOU FEELING? {person.cuisines.length > 0 && <span style={{ color }}>(pick any)</span>}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
        {CUISINES.map(c => <button key={c.id} onClick={() => toggle(c.id)} style={chip(person.cuisines.includes(c.id))}>{c.emoji} {c.label}</button>)}
      </div>
    </div>
  );
}

function HistoryPanel({ history, onClear }) {
  const [open, setOpen] = useState(true);
  if (history.length === 0) return null;
  return (
    <div style={{ maxWidth: "960px", margin: "0 auto 60px", padding: "0 16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: open ? "14px" : "0" }}>
        <button onClick={() => setOpen(o => !o)} style={{ display: "flex", alignItems: "center", gap: "8px", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
          <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "1.1rem", letterSpacing: "0.18em", color: "#2a2a40" }}>ORDER HISTORY</span>
          <span style={{ color: "#ff2d78", fontFamily: "'DM Sans',sans-serif", fontSize: "0.75rem", background: "rgba(255,45,120,0.1)", border: "1px solid rgba(255,45,120,0.2)", borderRadius: "12px", padding: "1px 8px" }}>{history.length}</span>
          <span style={{ color: "#2a2a40", fontSize: "0.75rem", marginLeft: "2px" }}>{open ? "▲" : "▼"}</span>
        </button>
        {open && <button onClick={onClear} style={{ background: "none", border: "none", color: "#252535", fontSize: "0.72rem", fontFamily: "'DM Sans',sans-serif", cursor: "pointer", letterSpacing: "0.1em" }} onMouseEnter={e => e.target.style.color = "#666"} onMouseLeave={e => e.target.style.color = "#252535"}>CLEAR ALL</button>}
      </div>
      {open && (
        <div style={{ background: "rgba(255,255,255,0.015)", border: "1px solid #1a1a28", borderRadius: "12px", overflow: "hidden" }}>
          <div style={{ padding: "10px 18px", borderBottom: "1px dashed #1e1e2e", display: "flex", gap: "16px" }}>
            {[["#", "28px"], ["CUISINE", "130px"], ["RESTAURANT", "1fr"], ["WHEN", "80px"]].map(([h, w]) => (
              <div key={h} style={{ width: w, flex: w === "1fr" ? "1" : "none", color: "#252538", fontSize: "0.64rem", letterSpacing: "0.2em", fontFamily: "'DM Sans',sans-serif" }}>{h}</div>
            ))}
          </div>
          {[...history].reverse().map((entry, i) => {
            const isFirst = i === 0;
            return (
              <div key={entry.timestamp} style={{ display: "flex", gap: "16px", alignItems: "center", padding: "10px 18px", borderBottom: i < history.length - 1 ? "1px dashed #141420" : "none", background: isFirst ? "rgba(255,45,120,0.04)" : "transparent" }}>
                <div style={{ width: "28px", color: "#1e1e30", fontSize: "0.72rem", fontFamily: "'DM Sans',sans-serif" }}>{history.length - i}</div>
                <div style={{ width: "130px", display: "flex", alignItems: "center", gap: "7px", flexShrink: 0 }}>
                  <span style={{ fontSize: "1rem" }}>{entry.cuisine.emoji}</span>
                  <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "0.9rem", letterSpacing: "0.08em", color: isFirst ? "#ff2d78" : "#383850" }}>{entry.cuisine.label.toUpperCase()}</span>
                </div>
                <div style={{ flex: 1, fontSize: "0.78rem", fontFamily: "'DM Sans',sans-serif", minWidth: 0 }}>
                  {entry.restaurant ? (
                    <span style={{ color: isFirst ? "#888" : "#2e2e48" }}>
                      {entry.restaurant.url
                        ? <a href={entry.restaurant.url} target="_blank" rel="noreferrer" style={{ color: "inherit", textDecoration: "none" }}>{entry.restaurant.name}</a>
                        : entry.restaurant.name}
                      {entry.restaurant.neighborhood && <span style={{ color: "#252538", marginLeft: "5px", fontSize: "0.7rem" }}>· {entry.restaurant.neighborhood}</span>}
                      {entry.restaurant.source === "ai" && <span style={{ color: "#1e1e30", marginLeft: "5px", fontSize: "0.65rem" }}>✦</span>}
                    </span>
                  ) : <span style={{ color: "#252535", fontStyle: "italic" }}>no restaurant found</span>}
                </div>
                <div style={{ width: "80px", color: "#222232", fontSize: "0.72rem", fontFamily: "'DM Sans',sans-serif", textAlign: "right", flexShrink: 0 }}>{formatTime(entry.timestamp)}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FavoritesManager({ favorites, setFavorites, onBack }) {
  const [selected, setSelected] = useState(CUISINES[0].id);
  const [inputVal, setInputVal] = useState("");
  const cuisine = CUISINES.find(c => c.id === selected);
  const saved   = favorites[selected] || [];

  const addRestaurant = () => {
    const trimmed = inputVal.trim();
    if (!trimmed || saved.length >= MAX_SAVED) return;
    setFavorites(prev => ({ ...prev, [selected]: [...(prev[selected] || []), trimmed] }));
    setInputVal("");
  };

  const removeRestaurant = idx =>
    setFavorites(prev => ({ ...prev, [selected]: prev[selected].filter((_, i) => i !== idx) }));

  const lbl = { color: "#303048", fontSize: "0.67rem", letterSpacing: "0.2em", marginBottom: "9px", fontFamily: "'DM Sans',sans-serif" };

  return (
    <div style={{ maxWidth: "680px", margin: "0 auto", padding: "0 16px 60px" }}>
      <button onClick={onBack} style={{ background: "none", border: "none", color: "#333350", fontFamily: "'DM Sans',sans-serif", fontSize: "0.8rem", letterSpacing: "0.1em", cursor: "pointer", marginBottom: "28px", padding: 0 }}
        onMouseEnter={e => e.target.style.color = "#666"} onMouseLeave={e => e.target.style.color = "#333350"}>
        ← BACK
      </button>
      <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "2rem", letterSpacing: "0.12em", color: "#2a2a48", marginBottom: "6px" }}>SAVED RESTAURANTS</div>
      <div style={{ color: "#252538", fontSize: "0.72rem", fontFamily: "'DM Sans',sans-serif", letterSpacing: "0.1em", marginBottom: "28px" }}>
        UP TO {MAX_SAVED} PER CUISINE · LEAVE EMPTY TO LET US FIND ONE
      </div>
      <div style={lbl}>PICK A CUISINE</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "28px" }}>
        {CUISINES.map(c => {
          const hasSaved = (favorites[c.id] || []).length > 0;
          const isSel    = c.id === selected;
          return (
            <button key={c.id} onClick={() => { setSelected(c.id); setInputVal(""); }} style={{
              padding: "5px 11px", borderRadius: "20px", position: "relative",
              border: `1px solid ${isSel ? "#ff2d78" : hasSaved ? "#2a2a48" : "#1e1e2c"}`,
              background: isSel ? "rgba(255,45,120,0.1)" : hasSaved ? "rgba(255,255,255,0.03)" : "transparent",
              color: isSel ? "#ff2d78" : hasSaved ? "#3a3a58" : "#2e2e48",
              cursor: "pointer", fontSize: "0.81rem", fontFamily: "'DM Sans',sans-serif", transition: "all .15s",
            }}>
              {c.emoji} {c.label}
              {hasSaved && !isSel && <span style={{ position: "absolute", top: "-3px", right: "-3px", width: "7px", height: "7px", borderRadius: "50%", background: "#ff2d78", border: "1px solid #0c0c13" }} />}
            </button>
          );
        })}
      </div>
      <div style={{ background: "rgba(255,255,255,0.022)", border: "1px solid #1e1e2c", borderRadius: "14px", padding: "22px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
          <span style={{ fontSize: "1.4rem" }}>{cuisine.emoji}</span>
          <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "1.3rem", letterSpacing: "0.1em", color: "#ff2d78" }}>{cuisine.label.toUpperCase()}</span>
          <span style={{ marginLeft: "auto", color: "#252538", fontSize: "0.7rem", fontFamily: "'DM Sans',sans-serif" }}>{saved.length}/{MAX_SAVED}</span>
        </div>
        {saved.length > 0 && (
          <div style={{ marginBottom: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>
            {saved.map((name, idx) => (
              <div key={idx} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 14px", borderRadius: "8px", background: "rgba(255,255,255,0.025)", border: "1px solid #1e1e2c" }}>
                <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: "0.88rem", color: "#3a3a58" }}>{name}</span>
                <button onClick={() => removeRestaurant(idx)} style={{ background: "none", border: "none", color: "#252538", cursor: "pointer", fontSize: "0.75rem", fontFamily: "'DM Sans',sans-serif", padding: "0 0 0 12px" }}
                  onMouseEnter={e => e.target.style.color = "#ff2d78"} onMouseLeave={e => e.target.style.color = "#252538"}>
                  REMOVE
                </button>
              </div>
            ))}
          </div>
        )}
        {saved.length < MAX_SAVED ? (
          <div style={{ display: "flex", gap: "8px" }}>
            <input value={inputVal} onChange={e => setInputVal(e.target.value)} onKeyDown={e => e.key === "Enter" && addRestaurant()}
              placeholder={saved.length === 0 ? "Add a restaurant..." : "Add another..."}
              style={{ flex: 1, background: "rgba(255,255,255,0.03)", border: "1px solid #252538", borderRadius: "8px", padding: "10px 14px", color: "#aaa", fontFamily: "'DM Sans',sans-serif", fontSize: "0.88rem", outline: "none" }} />
            <button onClick={addRestaurant} style={{ padding: "10px 18px", borderRadius: "8px", border: "1px solid rgba(255,45,120,0.3)", background: "rgba(255,45,120,0.08)", color: "#ff2d78", fontFamily: "'DM Sans',sans-serif", fontSize: "0.82rem", cursor: "pointer" }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(255,45,120,0.18)"}
              onMouseLeave={e => e.currentTarget.style.background = "rgba(255,45,120,0.08)"}>
              ADD
            </button>
          </div>
        ) : (
          <div style={{ color: "#252538", fontSize: "0.72rem", fontFamily: "'DM Sans',sans-serif", letterSpacing: "0.1em", textAlign: "center" }}>
            MAX {MAX_SAVED} SAVED · REMOVE ONE TO ADD ANOTHER
          </div>
        )}
        {saved.length === 0 && (
          <div style={{ marginTop: "12px", color: "#1e1e2e", fontSize: "0.7rem", fontFamily: "'DM Sans',sans-serif", letterSpacing: "0.08em" }}>
            NO SPOTS SAVED · WE'LL SEARCH FOR ONE WHEN THIS CUISINE IS PICKED
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [p1, setP1]             = useState({ cuisines: [] });
  const [p2, setP2]             = useState({ cuisines: [] });
  const [phase, setPhase]       = useState("setup");
  const [screen, setScreen]     = useState("main");
  const [result, setResult]     = useState(null);
  const [spin, setSpin]         = useState("🍽️");
  const [history, setHistory]   = useState([]);
  const [favorites, setFavorites] = useState({});
  const [lookupStatus, setLookupStatus] = useState(null);
  const iRef = useRef(null);

  useEffect(() => {
    try { const s = storage.get(HISTORY_KEY);   if (s?.value) setHistory(JSON.parse(s.value)); } catch (_) {}
    try { const s = storage.get(FAVORITES_KEY); if (s?.value) setFavorites(JSON.parse(s.value)); } catch (_) {}
  }, []);

  useEffect(() => {
    try { storage.set(FAVORITES_KEY, JSON.stringify(favorites)); } catch (_) {}
  }, [favorites]);

  const saveHistory = useCallback(h => {
    try { storage.set(HISTORY_KEY, JSON.stringify(h)); } catch (_) {}
  }, []);

  const recentIds = history.slice(-AVOID_LAST_N).map(e => e.cuisine.id);

  const runDecision = async (a, b) => {
    setPhase("deciding");
    setLookupStatus(null);
    if (iRef.current) clearInterval(iRef.current);

    const decided = decide(a, b, recentIds);

    await new Promise(resolve => {
      let f = 0;
      iRef.current = setInterval(() => {
        setSpin(CUISINES[Math.floor(Math.random() * CUISINES.length)].emoji);
        f++;
        if (f >= 22) { clearInterval(iRef.current); setSpin(decided.cuisine.emoji); setTimeout(resolve, 300); }
      }, 80);
    });

    const saved = favorites[decided.cuisine.id] || [];
    let restaurant = null;

    if (saved.length > 0) {
      restaurant = { name: saved[Math.floor(Math.random() * saved.length)], fromApi: false, source: "saved" };
      setLookupStatus("found");
    } else {
      setLookupStatus("searching");
      const found = await findRestaurant(decided.cuisine.label);
      if (found) { restaurant = found; setLookupStatus("found"); }
      else        { setLookupStatus("failed"); }
    }

    const finalResult = { ...decided, restaurant };
    setResult(finalResult);
    setPhase("result");
    setHistory(prev => { const next = [...prev, finalResult]; saveHistory(next); return next; });
  };

  const clearHistory = () => { setHistory([]); storage.delete(HISTORY_KEY); };

  const reset = () => {
    if (iRef.current) clearInterval(iRef.current);
    setPhase("setup"); setResult(null); setLookupStatus(null);
    setP1({ cuisines: [] }); setP2({ cuisines: [] });
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0c0c13", color: "#f0f0f0" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;1,9..40,400&display=swap');
        * { box-sizing: border-box; }
        @keyframes flicker { 0%,96%,100%{opacity:1} 97%{opacity:.82} 99%{opacity:.9} }
        @keyframes slot { 0%{transform:translateY(-10px) scale(.8);opacity:.3} 50%{transform:translateY(0) scale(1.2);opacity:1} 100%{transform:translateY(10px) scale(.8);opacity:.3} }
        @keyframes pop { 0%{transform:scale(.7) translateY(28px);opacity:0} 65%{transform:scale(1.05) translateY(-4px);opacity:1} 100%{transform:scale(1) translateY(0);opacity:1} }
        @keyframes bdg { from{transform:translateY(12px);opacity:0} to{transform:translateY(0);opacity:1} }
        @keyframes dot { 0%,100%{opacity:.2} 50%{opacity:1} }
        @keyframes pulse { 0%,100%{opacity:.4} 50%{opacity:1} }
        @keyframes rstin { from{transform:translateY(18px);opacity:0} to{transform:translateY(0);opacity:1} }
        .hdr  { animation: flicker 7s ease-in-out infinite }
        .slot { display:inline-block; animation: slot .16s ease-in-out infinite alternate }
        .pop  { animation: pop .55s cubic-bezier(.34,1.56,.64,1) both }
        .bdg  { animation: bdg .4s ease both }
        .rstin{ animation: rstin .5s cubic-bezier(.34,1.3,.64,1) .2s both }
        .settle { padding:15px 52px; border-radius:50px; border:2px solid #ffe100; background:transparent; color:#ffe100; font-family:'Bebas Neue',sans-serif; font-size:1.85rem; letter-spacing:.12em; cursor:pointer; text-shadow:0 0 16px #ffe10099; box-shadow:0 0 28px #ffe10022,inset 0 0 28px #ffe1000e; transition:box-shadow .2s,background .2s }
        .settle:hover { background:#ffe10012; box-shadow:0 0 55px #ffe10050,inset 0 0 36px #ffe10020 }
        .veto { padding:11px 22px; border-radius:8px; border:1px solid #2c2c3c; background:transparent; color:#4a4a62; font-family:'DM Sans',sans-serif; font-size:.88rem; cursor:pointer; transition:all .15s; letter-spacing:.04em }
        .veto:hover { border-color:#555; color:#888 }
        .rst  { padding:11px 22px; border-radius:8px; border:1px solid #1a1a26; background:transparent; color:#2c2c42; font-family:'DM Sans',sans-serif; font-size:.88rem; cursor:pointer; transition:all .15s }
        .rst:hover { border-color:#2a2a3c; color:#484860 }
        .scan { pointer-events:none; position:fixed; inset:0; background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.035) 2px,rgba(0,0,0,.035) 4px); z-index:0 }
        input::placeholder { color:#2a2a3e }
        input:focus { border-color:#333350 !important; outline:none }
        a { color: inherit }
      `}</style>

      <div className="scan" />
      <div style={{ position: "relative", zIndex: 1 }}>

        {/* HEADER */}
        <div style={{ textAlign: "center", padding: "44px 20px 24px", position: "relative" }}>
          <div className="hdr" style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "clamp(2.6rem,9vw,5.2rem)", letterSpacing: ".06em", lineHeight: 1, color: "#ff2d78", textShadow: "0 0 28px #ff2d7880,0 0 60px #ff2d7838" }}>
            WHAT ARE WE EATING?
          </div>
          <div style={{ marginTop: "8px", color: "#22223a", fontSize: ".68rem", letterSpacing: ".22em", fontFamily: "'DM Sans',sans-serif" }}>
            THE LAST DECISION YOU'LL EVER ARGUE ABOUT
          </div>
          {screen === "main" && phase === "setup" && (
            <button onClick={() => setScreen("favorites")}
              style={{ position: "absolute", right: "20px", top: "50%", transform: "translateY(-50%)", background: "none", border: "1px solid #1e1e2c", borderRadius: "8px", color: "#2a2a40", fontFamily: "'DM Sans',sans-serif", fontSize: "0.72rem", letterSpacing: "0.12em", cursor: "pointer", padding: "7px 14px", transition: "all .15s" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "#333350"; e.currentTarget.style.color = "#484860"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "#1e1e2c"; e.currentTarget.style.color = "#2a2a40"; }}>
              ⭐ SAVED
            </button>
          )}
        </div>

        {screen === "favorites" && (
          <FavoritesManager favorites={favorites} setFavorites={setFavorites} onBack={() => setScreen("main")} />
        )}

        {screen === "main" && (
          <>
            {phase === "setup" && (
              <>
                <div style={{ maxWidth: "960px", margin: "0 auto", padding: "0 16px 36px" }}>
                  <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                    <PersonPanel person={p1} setPerson={setP1} label="YOU"  color="#ff2d78" bg="rgba(255,45,120,.09)" />
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "0 2px", flexShrink: 0 }}>
                      <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "1.5rem", color: "#1c1c2c", letterSpacing: ".1em" }}>VS</span>
                    </div>
                    <PersonPanel person={p2} setPerson={setP2} label="THEM" color="#00e5ff" bg="rgba(0,229,255,.07)" />
                  </div>
                  <div style={{ textAlign: "center", marginTop: "36px" }}>
                    {recentIds.length > 0 && (
                      <div style={{ marginBottom: "12px", color: "#252538", fontSize: "0.69rem", letterSpacing: "0.14em", fontFamily: "'DM Sans',sans-serif" }}>
                        AVOIDING: {history.slice(-AVOID_LAST_N).map(e => `${e.cuisine.emoji} ${e.cuisine.label}`).join(" · ")}
                      </div>
                    )}
                    <button className="settle" onClick={() => runDecision(p1, p2)}>SETTLE THIS</button>
                    <div style={{ marginTop: "11px", color: "#1e1e30", fontSize: ".67rem", letterSpacing: ".14em", fontFamily: "'DM Sans',sans-serif" }}>
                      PICK NOTHING AND LET FATE DECIDE — WE DON'T JUDGE
                    </div>
                  </div>
                </div>
                <HistoryPanel history={history} onClear={clearHistory} />
              </>
            )}

            {phase === "deciding" && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "80px 20px 120px", gap: "18px" }}>
                <div style={{ fontSize: "5.5rem", lineHeight: 1 }} className="slot">{spin}</div>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "1.3rem", letterSpacing: ".18em", color: "#252540" }}>
                  {lookupStatus === "searching" ? "FINDING YOUR SPOT" : "CALCULATING YOUR FATE"}
                </div>
                {lookupStatus === "searching" && (
                  <div style={{ color: "#1e1e30", fontSize: "0.7rem", fontFamily: "'DM Sans',sans-serif", letterSpacing: "0.12em", animation: "pulse 1.4s ease-in-out infinite" }}>
                    SEARCHING MANHATTAN...
                  </div>
                )}
                <div style={{ display: "flex", gap: "7px" }}>
                  {[0, 1, 2].map(i => <div key={i} style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#ff2d78", animation: `dot ${.7 + i * .15}s ease-in-out ${i * .1}s infinite` }} />)}
                </div>
              </div>
            )}

            {phase === "result" && result && (
              <>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "20px 20px 48px" }}>
                  <div className="pop" style={{ textAlign: "center", maxWidth: "560px", width: "100%" }}>
                    <div style={{ fontSize: "5rem", lineHeight: 1, marginBottom: "4px" }}>{result.cuisine.emoji}</div>
                    <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "clamp(3.2rem,12vw,5.8rem)", letterSpacing: ".05em", lineHeight: 1, color: "#ff2d78", textShadow: "0 0 40px #ff2d7870,0 0 80px #ff2d7835", marginBottom: "18px" }}>
                      {result.cuisine.label.toUpperCase()}
                    </div>

                    {result.restaurant && (
                      <div className="rstin" style={{ marginBottom: "22px", padding: "16px 22px", borderRadius: "12px", background: "rgba(255,255,255,0.03)", border: "1px solid #1e1e2c" }}>
                        <div style={{ color: "#252538", fontSize: "0.64rem", letterSpacing: "0.2em", fontFamily: "'DM Sans',sans-serif", marginBottom: "6px" }}>
                          {result.restaurant.source === "saved" ? "⭐ YOUR SAVED SPOT" : "✦ SUGGESTED FOR YOU"}
                        </div>
                        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "1.9rem", letterSpacing: "0.08em", color: "#ffe100", textShadow: "0 0 22px #ffe10055", lineHeight: 1 }}>
                          {result.restaurant.name}
                        </div>
                        {result.restaurant.neighborhood && (
                          <div style={{ color: "#2a2a42", fontSize: "0.75rem", fontFamily: "'DM Sans',sans-serif", marginTop: "5px", letterSpacing: "0.08em" }}>
                            {result.restaurant.neighborhood}
                            {result.restaurant.rating && <span style={{ marginLeft: "8px" }}>· ⭐ {result.restaurant.rating} ({result.restaurant.reviewCount?.toLocaleString()} reviews)</span>}
                          </div>
                        )}
                        {/* Order links */}
                        {(result.restaurant.uberEatsUrl || result.restaurant.doorDashUrl) && (
                          <div style={{ display: "flex", gap: "8px", marginTop: "14px", flexWrap: "wrap" }}>
                            {result.restaurant.uberEatsUrl && (
                              <a href={result.restaurant.uberEatsUrl} target="_blank" rel="noreferrer" style={{ padding: "7px 16px", borderRadius: "8px", border: "1px solid #1e1e2c", background: "rgba(255,255,255,0.03)", color: "#2a2a42", fontFamily: "'DM Sans',sans-serif", fontSize: "0.75rem", textDecoration: "none", letterSpacing: "0.06em", transition: "all .15s" }}
                                onMouseEnter={e => { e.currentTarget.style.borderColor = "#333350"; e.currentTarget.style.color = "#666"; }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor = "#1e1e2c"; e.currentTarget.style.color = "#2a2a42"; }}>
                                🛵 UberEats →
                              </a>
                            )}
                            {result.restaurant.doorDashUrl && (
                              <a href={result.restaurant.doorDashUrl} target="_blank" rel="noreferrer" style={{ padding: "7px 16px", borderRadius: "8px", border: "1px solid #1e1e2c", background: "rgba(255,255,255,0.03)", color: "#2a2a42", fontFamily: "'DM Sans',sans-serif", fontSize: "0.75rem", textDecoration: "none", letterSpacing: "0.06em", transition: "all .15s" }}
                                onMouseEnter={e => { e.currentTarget.style.borderColor = "#333350"; e.currentTarget.style.color = "#666"; }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor = "#1e1e2c"; e.currentTarget.style.color = "#2a2a42"; }}>
                                🔴 DoorDash →
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {lookupStatus === "failed" && (
                      <div style={{ marginBottom: "20px", color: "#252538", fontSize: "0.75rem", fontFamily: "'DM Sans',sans-serif", letterSpacing: "0.08em" }}>
                        couldn't find a spot — try saving some favorites
                      </div>
                    )}

                    {result.wasCompromise && (
                      <div className="bdg" style={{ display: "inline-block", marginBottom: "20px", padding: "7px 18px", borderRadius: "20px", border: "1px solid rgba(255,45,120,.22)", background: "rgba(255,45,120,.06)", color: "#ff2d78", fontFamily: "'DM Sans',sans-serif", fontSize: ".8rem", letterSpacing: ".06em" }}>
                        ⚡ COIN FLIP WINNER
                      </div>
                    )}

                    <div style={{ fontFamily: "'DM Sans',sans-serif", fontStyle: "italic", color: "#2c2c45", fontSize: ".87rem", letterSpacing: ".04em", marginBottom: "38px", lineHeight: 1.55 }}>
                      {result.verdict}
                    </div>

                    <div style={{ width: "50px", height: "1px", background: "linear-gradient(90deg,transparent,#22223a,transparent)", margin: "0 auto 30px" }} />

                    <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
                      <button className="veto" onClick={() => runDecision(p1, p2)}>😤 VETO — RE-ROLL</button>
                      <button className="rst"  onClick={reset}>START OVER</button>
                    </div>
                  </div>
                </div>
                <HistoryPanel history={history} onClear={clearHistory} />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
