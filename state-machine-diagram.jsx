import React, { useState } from 'react';

const states = {
  IDLE: { color: '#6B7280', label: 'IDLE', description: 'No active task; awaiting execute_task_spec call' },
  GENERATING: { color: '#3B82F6', label: 'GENERATING', description: 'Agent Alpha actively producing code' },
  REVIEWING: { color: '#8B5CF6', label: 'REVIEWING', description: 'Agent Beta analyzing Alpha\'s output' },
  REVISING: { color: '#F59E0B', label: 'REVISING', description: 'Alpha incorporating Beta feedback' },
  CONVERGED: { color: '#10B981', label: 'CONVERGED', description: 'Quality threshold met; ready for handoff' },
  ESCALATED: { color: '#EF4444', label: 'ESCALATED', description: 'Loop exhausted; awaiting Orchestration decision' },
  FAILED: { color: '#991B1B', label: 'FAILED', description: 'Unrecoverable error; endpoint unavailable >10min' }
};

const transitions = [
  { from: 'IDLE', to: 'GENERATING', condition: 'execute_task_spec() called' },
  { from: 'GENERATING', to: 'REVIEWING', condition: 'Alpha completes generation' },
  { from: 'GENERATING', to: 'FAILED', condition: 'Endpoint unavailable >10min' },
  { from: 'REVIEWING', to: 'REVISING', condition: 'score < threshold AND improving' },
  { from: 'REVIEWING', to: 'CONVERGED', condition: 'quality_score ≥ threshold' },
  { from: 'REVIEWING', to: 'ESCALATED', condition: 'max_iter OR stagnant' },
  { from: 'REVISING', to: 'REVIEWING', condition: 'Alpha completes revision' },
  { from: 'REVISING', to: 'FAILED', condition: 'Endpoint unavailable >10min' },
  { from: 'ESCALATED', to: 'REVISING', condition: 'Orchestration: retry' },
  { from: 'ESCALATED', to: 'IDLE', condition: 'Orchestration: abort' },
  { from: 'ESCALATED', to: 'FAILED', condition: 'Timeout or explicit fail' },
  { from: 'CONVERGED', to: 'IDLE', condition: 'Handoff completed' },
  { from: 'FAILED', to: 'IDLE', condition: 'Error acknowledged' }
];

const positions = {
  IDLE: { x: 120, y: 200 },
  GENERATING: { x: 280, y: 100 },
  REVIEWING: { x: 450, y: 200 },
  REVISING: { x: 450, y: 350 },
  CONVERGED: { x: 620, y: 100 },
  ESCALATED: { x: 620, y: 300 },
  FAILED: { x: 280, y: 350 }
};

export default function StateMachineDiagram() {
  const [activeState, setActiveState] = useState('IDLE');
  const [hoveredState, setHoveredState] = useState(null);
  const [hoveredTransition, setHoveredTransition] = useState(null);

  const getArrowPath = (from, to) => {
    const fx = positions[from].x, fy = positions[from].y;
    const tx = positions[to].x, ty = positions[to].y;
    const dx = tx - fx, dy = ty - fy;
    const len = Math.sqrt(dx*dx + dy*dy);
    const nx = dx/len, ny = dy/len;
    const sx = fx + nx*45, sy = fy + ny*45;
    const ex = tx - nx*45, ey = ty - ny*45;
    const mx = (sx+ex)/2, my = (sy+ey)/2;
    const curve = from === to ? 60 : 25;
    const cx = mx - ny*curve, cy = my + nx*curve;
    return `M${sx},${sy} Q${cx},${cy} ${ex},${ey}`;
  };

  return (
    <div className="min-h-screen bg-slate-900 p-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-2 text-center">
          Dual-Agent State Machine
        </h1>
        <p className="text-slate-400 text-center mb-8">
          Click states to activate • Hover for details
        </p>
        
        <div className="bg-slate-800 rounded-2xl p-6 shadow-2xl mb-8">
          <svg viewBox="0 0 750 450" className="w-full">
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#94A3B8" />
              </marker>
              <marker id="arrow-active" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#60A5FA" />
              </marker>
            </defs>
            
            {transitions.map((t, i) => {
              const isActive = t.from === activeState;
              const isHovered = hoveredTransition === i;
              return (
                <g key={i} onMouseEnter={() => setHoveredTransition(i)} onMouseLeave={() => setHoveredTransition(null)}>
                  <path
                    d={getArrowPath(t.from, t.to)}
                    fill="none"
                    stroke={isActive ? '#60A5FA' : isHovered ? '#94A3B8' : '#475569'}
                    strokeWidth={isActive || isHovered ? 3 : 2}
                    markerEnd={isActive ? 'url(#arrow-active)' : 'url(#arrow)'}
                    style={{ transition: 'all 0.3s' }}
                  />
                </g>
              );
            })}
            
            {Object.entries(positions).map(([state, pos]) => {
              const cfg = states[state];
              const isActive = state === activeState;
              const isHovered = state === hoveredState;
              const scale = isActive ? 1.15 : isHovered ? 1.08 : 1;
              return (
                <g
                  key={state}
                  transform={`translate(${pos.x}, ${pos.y})`}
                  onClick={() => setActiveState(state)}
                  onMouseEnter={() => setHoveredState(state)}
                  onMouseLeave={() => setHoveredState(null)}
                  style={{ cursor: 'pointer' }}
                >
                  <circle
                    r={40 * scale}
                    fill={cfg.color}
                    stroke={isActive ? '#fff' : 'transparent'}
                    strokeWidth={3}
                    style={{ transition: 'all 0.3s', filter: isActive ? 'drop-shadow(0 0 15px rgba(255,255,255,0.4))' : 'none' }}
                  />
                  <text textAnchor="middle" dy="0.35em" fill="white" fontSize={state.length > 8 ? 9 : 11} fontWeight="600">
                    {cfg.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-slate-800 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: states[activeState].color }} />
              {states[activeState].label}
            </h2>
            <p className="text-slate-300 mb-4">{states[activeState].description}</p>
            <h3 className="text-sm font-medium text-slate-400 mb-2">Valid Transitions:</h3>
            <div className="space-y-2">
              {transitions.filter(t => t.from === activeState).map((t, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="text-slate-500">→</span>
                  <span className="font-medium" style={{ color: states[t.to].color }}>{t.to}</span>
                  <span className="text-slate-500">|</span>
                  <span className="text-slate-400">{t.condition}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-slate-800 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Loop Prevention</h2>
            <div className="space-y-3 text-sm">
              <div className="flex gap-3">
                <span className="text-amber-400 font-mono">01</span>
                <span className="text-slate-300">Hard iteration cap (default: 5)</span>
              </div>
              <div className="flex gap-3">
                <span className="text-amber-400 font-mono">02</span>
                <span className="text-slate-300">Stagnation: |Δscore| &lt; 2 for 2 iterations</span>
              </div>
              <div className="flex gap-3">
                <span className="text-amber-400 font-mono">03</span>
                <span className="text-slate-300">Oscillation: same content hash twice</span>
              </div>
              <div className="flex gap-3">
                <span className="text-amber-400 font-mono">04</span>
                <span className="text-slate-300">Timeout guard (default: 30 min)</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 bg-slate-800 rounded-xl p-6">
          <h2 className="text-xl font-semibold text-white mb-4">All State Transitions</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {transitions.map((t, i) => (
              <div
                key={i}
                className={`p-3 rounded-lg border transition-all ${hoveredTransition === i ? 'border-blue-500 bg-slate-700' : 'border-slate-700 bg-slate-800/50'}`}
                onMouseEnter={() => setHoveredTransition(i)}
                onMouseLeave={() => setHoveredTransition(null)}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 rounded text-xs font-medium text-white" style={{ backgroundColor: states[t.from].color }}>
                    {t.from}
                  </span>
                  <span className="text-slate-500">→</span>
                  <span className="px-2 py-0.5 rounded text-xs font-medium text-white" style={{ backgroundColor: states[t.to].color }}>
                    {t.to}
                  </span>
                </div>
                <p className="text-xs text-slate-400">{t.condition}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
