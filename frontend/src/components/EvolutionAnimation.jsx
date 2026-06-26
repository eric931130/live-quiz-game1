import React, { useState, useEffect } from 'react';
import { Sparkles, Trophy, Zap, Accessibility } from 'lucide-react';
import ParticleButton from './ParticleButton';

export default function EvolutionAnimation({ evolutionData, onClose }) {
  const { toStage, fromStageName, toStageName, toStageTitle, characterName, toImageUrl } = evolutionData;
  const [stage, setStage] = useState('charging'); // charging, flashing, resolved
  const [countdown, setCountdown] = useState(12);
  const [reducedMotion, setReducedMotion] = useState(
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  useEffect(() => {
    if (reducedMotion) {
      setTimeout(() => {
        setStage('resolved');
      }, 0);
      return;
    }

    // Stage 1: Charging (0s to 3s)
    const tFlashing = setTimeout(() => {
      setStage('flashing');
    }, 3000);

    // Stage 2: Flashing (3s to 6s)
    const tResolved = setTimeout(() => {
      setStage('resolved');
    }, 6000);

    return () => {
      clearTimeout(tFlashing);
      clearTimeout(tResolved);
    };
  }, [reducedMotion]);

  // Automatic countdown timer to close
  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          onClose && onClose();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [onClose]);

  // Generate particle parameters
  const particles = React.useMemo(() => {
    return Array.from({ length: 45 }).map((_, idx) => {
      const seededRandom = (seed) => {
        const x = Math.sin(seed) * 10000;
        return x - Math.floor(x);
      };
      const r1 = seededRandom(idx * 1.7 + 1.1);
      const r2 = seededRandom(idx * 2.3 + 2.7);
      const r3 = seededRandom(idx * 3.1 + 4.2);
      const r4 = seededRandom(idx * 4.7 + 6.9);
      
      const size = r1 * 8 + 4; // 4px to 12px
      const colors = ['#81c784', '#ffd54f', '#4fc3f7', '#ffd54f', '#a5d6a7', '#80deea'];
      const color = colors[idx % colors.length];
      const left = r2 * 100; // 0% to 100%
      const delay = r3 * 5; // 0s to 5s
      const duration = r4 * 4 + 3; // 3s to 7s
      return { id: idx, size, color, left, delay, duration };
    });
  }, []);

  return (
    <div className="evolution-overlay" style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      background: 'radial-gradient(circle, #0c1a11 20%, #030805 100%)',
      color: 'white',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
      overflow: 'hidden',
      fontFamily: 'Inter, system-ui, sans-serif'
    }}>
      {/* Inline styles for custom keyframes and particles */}
      <style>{`
        @keyframes float-up {
          0% {
            transform: translateY(100vh) scale(0.5);
            opacity: 0;
          }
          10% {
            opacity: 0.8;
          }
          90% {
            opacity: 0.8;
          }
          100% {
            transform: translateY(-10vh) scale(1.2);
            opacity: 0;
          }
        }
        @keyframes pulse-radial {
          0%, 100% {
            transform: scale(1);
            opacity: 0.2;
            box-shadow: 0 0 50px rgba(76, 175, 80, 0.4);
          }
          50% {
            transform: scale(1.15);
            opacity: 0.5;
            box-shadow: 0 0 100px rgba(255, 213, 79, 0.7);
          }
        }
        @keyframes flash-screen {
          0%, 100% { background-color: transparent; }
          50% { background-color: rgba(255, 255, 255, 0.9); }
        }
        @keyframes stage-shake {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          10% { transform: translate(-2px, -2px) rotate(-1deg); }
          20% { transform: translate(2px, 0px) rotate(1deg); }
          30% { transform: translate(0px, 2px) rotate(0deg); }
          40% { transform: translate(1px, -1px) rotate(1deg); }
          50% { transform: translate(-1px, 2px) rotate(-1deg); }
          60% { transform: translate(-3px, 1px) rotate(0deg); }
          70% { transform: translate(2px, 1px) rotate(-1deg); }
          80% { transform: translate(-1px, -1px) rotate(1deg); }
          90% { transform: translate(3px, 2px) rotate(0deg); }
        }
        @keyframes pop-reveal {
          0% { transform: scale(0.3); opacity: 0; filter: brightness(3); }
          50% { transform: scale(1.1); filter: brightness(1.5); }
          100% { transform: scale(1); opacity: 1; filter: brightness(1); }
        }
        .particle-dot {
          position: absolute;
          bottom: -20px;
          border-radius: 50%;
          pointer-events: none;
        }
        .evolution-glow-ring {
          position: absolute;
          width: 320px;
          height: 320px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(129,199,132,0.15) 0%, transparent 70%);
          pointer-events: none;
          z-index: 1;
        }
        .motion-charging {
          animation: stage-shake 0.2s infinite;
        }
        .motion-flashing {
          animation: stage-shake 0.05s infinite, flash-screen 0.4s infinite;
        }
      `}</style>

      {/* Accessibilty Reduced Motion Toggle */}
      <div style={{ position: 'absolute', top: '20px', left: '20px', zIndex: 10, display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(0,0,0,0.5)', padding: '0.4rem 0.8rem', borderRadius: '20px', fontSize: '0.8rem' }}>
        <Accessibility size={16} />
        <span>無障礙動態：</span>
        <button 
          style={{ background: reducedMotion ? 'var(--primary-color)' : '#555', border: 'none', borderRadius: '10px', color: 'white', padding: '0.1rem 0.6rem', cursor: 'pointer' }}
          onClick={() => {
            setReducedMotion(!reducedMotion);
            if (!reducedMotion) setStage('resolved');
          }}
        >
          {reducedMotion ? '簡化靜態' : '完整動畫'}
        </button>
      </div>

      {/* Skip Button */}
      <div style={{ position: 'absolute', top: '20px', right: '20px', zIndex: 10 }}>
        <button 
          className="btn" 
          style={{ background: 'rgba(255, 255, 255, 0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', padding: '0.5rem 1.2rem', borderRadius: '24px', cursor: 'pointer', transition: 'all 0.2s' }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
          onClick={onClose}
        >
          跳過動畫 (剩餘 {countdown} 秒)
        </button>
      </div>

      {/* Floating Particles */}
      {!reducedMotion && stage !== 'resolved' && particles.map(p => (
        <div 
          key={p.id}
          className="particle-dot"
          style={{
            width: `${p.size}px`,
            height: `${p.size}px`,
            background: p.color,
            left: `${p.left}%`,
            animation: `float-up ${p.duration}s linear infinite`,
            animationDelay: `${p.delay}s`,
            boxShadow: `0 0 10px ${p.color}`
          }}
        />
      ))}

      {/* Core Animation Arena */}
      <div style={{ position: 'relative', width: '400px', height: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
        {/* Glow rings */}
        {!reducedMotion && (
          <div className="evolution-glow-ring" style={{
            animation: stage === 'charging' 
              ? 'pulse-radial 2s infinite' 
              : stage === 'flashing' 
                ? 'pulse-radial 0.5s infinite' 
                : 'pulse-radial 4s infinite'
          }} />
        )}

        {/* Character Card Visual */}
        <div 
          className={stage === 'charging' ? 'motion-charging' : stage === 'flashing' ? 'motion-flashing' : ''}
          style={{
            position: 'relative',
            width: '280px',
            height: '280px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, rgba(31, 107, 58, 0.8), rgba(13, 21, 59, 0.9))',
            border: '5px solid var(--gold-bright)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            boxShadow: '0 20px 60px rgba(0,0,0,0.8), 0 0 40px rgba(129, 199, 132, 0.3)',
            animation: stage === 'resolved' ? 'pop-reveal 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275)' : ''
          }}
        >
          {stage !== 'resolved' ? (
            <div style={{ textAlign: 'center', opacity: stage === 'charging' ? 0.7 : 0.3, transition: 'all 0.5s' }}>
              <span style={{ fontSize: '6rem' }}>🥚</span>
              <p style={{ margin: '0.5rem 0 0 0', fontWeight: 'bold', color: 'var(--gold-bright)', letterSpacing: '2px' }}>
                {stage === 'charging' ? '聚合能量中...' : '即將破殼蛻變...'}
              </p>
            </div>
          ) : (
            <div style={{ width: '100%', height: '100%', position: 'relative' }}>
              {toImageUrl ? (
                <img src={toImageUrl} alt={toStageName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0d153b' }}>
                  <span style={{ fontSize: '5rem' }}>🐉</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Details / Text Box */}
      <div style={{ 
        marginTop: '2rem', 
        textAlign: 'center', 
        zIndex: 2, 
        maxWidth: '500px', 
        padding: '0 1.5rem',
        minHeight: '150px'
      }}>
        {stage !== 'resolved' ? (
          <div style={{ animation: 'pulse 1.5s infinite' }}>
            <h2 style={{ fontSize: '1.8rem', color: 'var(--primary-light)', fontWeight: 'bold' }}>
              {characterName} 進化契約啟動
            </h2>
            <p style={{ color: '#aaa', fontSize: '1rem', marginTop: '0.8rem' }}>
              正在檢測並吸納你的永續學習能量...
            </p>
          </div>
        ) : (
          <div style={{ animation: 'pop-reveal 0.6s ease-out' }}>
            <span style={{ 
              background: 'linear-gradient(90deg, var(--gold-bright), #fff, var(--gold-bright))', 
              WebkitBackgroundClip: 'text', 
              WebkitTextFillColor: 'transparent',
              fontSize: '1.25rem',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.3rem',
              marginBottom: '0.5rem'
            }}>
              <Trophy size={20} style={{ color: 'var(--gold-bright)' }} /> 進化完成 (Evolution Success!)
            </span>
            <h1 style={{ fontSize: '2.5rem', color: 'white', fontWeight: '800', margin: '0 0 0.5rem 0' }}>
              {characterName}
            </h1>
            <h2 style={{ fontSize: '1.6rem', color: 'var(--primary-light)', margin: '0 0 1rem 0', fontWeight: 'bold' }}>
              第 {toStage} 階段：{toStageName} ── <span style={{ color: 'var(--gold-bright)' }}>{toStageTitle}</span>
            </h2>
            <p style={{ color: '#cbd5e1', fontSize: '1rem', lineHeight: '1.6' }}>
              恭喜！你成功從「{fromStageName}」進化到了「{toStageName}」。
              這代表你在 SDGs 學習地圖中累積了豐碩的學習成果。繼續前行，帶領你的夥伴衝擊最終形態吧！
            </p>
            <div style={{ marginTop: '1.5rem' }}>
              <ParticleButton className="btn primary-btn" style={{ padding: '0.6rem 2.5rem', borderRadius: '24px', fontWeight: 'bold' }} onClick={onClose}>
                關閉並確認夥伴狀態
              </ParticleButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
