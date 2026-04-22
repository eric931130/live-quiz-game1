import React, { useState } from 'react';
import './ParticleButton.css'; // We will create this

export default function ParticleButton({ onClick, children, className, disabled, type = "button", style = {} }) {
  const [particles, setParticles] = useState([]);

  const handleClick = (e) => {
    // Generate some particles
    const rect = e.currentTarget.getBoundingClientRect();
    const newParticles = Array.from({ length: 6 }).map((_, i) => ({
      id: Date.now() + i,
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      vx: (Math.random() - 0.5) * 60,
      vy: (Math.random() - 0.5) * 60
    }));
    
    setParticles(prev => [...prev, ...newParticles]);
    
    setTimeout(() => {
      setParticles(prev => prev.filter(p => !newParticles.find(n => n.id === p.id)));
    }, 600);

    if (onClick) onClick(e);
  };

  return (
    <button 
      type={type}
      className={`particle-btn ${className || ''}`}
      onClick={handleClick}
      disabled={disabled}
      style={{ position: 'relative', overflow: 'hidden', ...style }}
    >
      <span className="btn-content" style={{ display: 'inherit', alignItems: 'inherit', justifyContent: 'inherit', gap: 'inherit', width: '100%' }}>{children}</span>
      {particles.map(p => (
        <span 
          key={p.id} 
          className="particle" 
          style={{
             left: p.x, 
             top: p.y,
             '--vx': `${p.vx}px`,
             '--vy': `${p.vy}px`
          }}
        ></span>
      ))}
    </button>
  );
}
