import React, { useState } from 'react';
import './ParticleButton.css'; // We will create this

export default function ParticleButton({ onClick, children, className, disabled, type = "button", style = {} }) {
  const [particles, setParticles] = useState([]);

  const handleClick = (e) => {
    // Generate some particles
    const rect = e.currentTarget.getBoundingClientRect();
    const newParticles = Array.from({ length: 15 }).map((_, i) => {
      const colors = ['#4CAF50', '#03A9F4', '#FF9800', '#FBC02D', '#C62828'];
      return {
        id: Date.now() + i,
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        vx: (Math.random() - 0.5) * 120,
        vy: (Math.random() - 0.5) * 120 - 20,
        size: Math.random() * 8 + 4,
        color: colors[Math.floor(Math.random() * colors.length)]
      };
    });
    
    setParticles(prev => [...prev, ...newParticles]);
    
    setTimeout(() => {
      setParticles(prev => prev.filter(p => !newParticles.find(n => n.id === p.id)));
    }, 800);

    if (onClick) onClick(e);
  };

  return (
    <button 
      type={type}
      className={`particle-btn ${className || ''}`}
      onClick={handleClick}
      disabled={disabled}
      style={{ position: 'relative', ...style }}
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
             '--vy': `${p.vy}px`,
             '--size': `${p.size}px`,
             '--color': p.color
          }}
        ></span>
      ))}
    </button>
  );
}
