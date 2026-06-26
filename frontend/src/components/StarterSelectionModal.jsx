import React, { useState, useEffect } from 'react';
import { Sparkles, Trophy, Check } from 'lucide-react';
import ParticleButton from './ParticleButton';

export default function StarterSelectionModal({ user, API_BASE_URL, onSelectSuccess }) {
  const [starters, setStarters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let active = true;
    const fetchStarters = async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch(`${API_BASE_URL}/api/player/starters`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (active) {
            setStarters(data);
          }
        }
      } catch (err) {
        console.error("Failed to fetch starters:", err);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };
    fetchStarters();
    return () => { active = false; };
  }, [user, API_BASE_URL]);

  const handleSelect = (starter) => {
    setSelected(starter);
    setConfirming(true);
  };

  const handleConfirm = async () => {
    if (!selected) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`${API_BASE_URL}/api/player/select-starter`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ characterId: selected.character.id })
      });
      if (res.ok) {
        alert(`成功與 ${selected.character.name} 建立連結！牠將伴隨你的永續學習路程進化蛻變！`);
        onSelectSuccess && onSelectSuccess();
      } else {
        const errData = await res.json();
        alert(`選擇失敗：${errData.error || '未知的錯誤'}`);
      }
    } catch (err) {
      console.error(err);
      alert('選擇失敗，請稍後再試。');
    }
  };

  if (loading) {
    return (
      <div className="app-tool-window-modal-overlay" style={{ background: 'rgba(12, 24, 18, 0.95)' }}>
        <div style={{ color: 'var(--primary-light)', fontSize: '1.5rem', fontWeight: 'bold' }}>
          ✨ 召喚夥伴契機中...
        </div>
      </div>
    );
  }

  return (
    <div className="app-tool-window-modal-overlay" style={{ background: 'rgba(12, 24, 18, 0.96)', backdropFilter: 'blur(10px)', zIndex: 9999 }}>
      <div className="app-tool-window-modal animate-pop-in" style={{ width: '100%', maxWidth: '850px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="app-tool-window-header">
          <div className="app-tool-window-header-title">
            <Sparkles size={20} color="var(--gold-bright)" />
            <span style={{ fontWeight: 'bold' }}>選擇你的永續學習初始夥伴 (Starter Character)</span>
          </div>
        </div>

        <div className="app-tool-window-body" style={{ padding: '2.5rem' }}>
          <h2 style={{ textAlign: 'center', color: 'var(--primary-color)', fontSize: '2rem', marginBottom: '0.5rem', fontWeight: '800' }}>
            解鎖你的第一顆永續之蛋
          </h2>
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: '2.5rem', fontSize: '1.05rem', maxWidth: '650px', margin: '0 auto 2.5rem' }}>
            歡迎加入 AI 金融白皮書挑戰平台！每位玩家都需要選擇一個專屬的初始角色。
            角色會從蛋開始，隨著你通關、獲得積分與成就，歷經 6 個階段的終極進化蛻變！
          </p>

          {confirming && selected ? (
            <div className="animate-fade-in" style={{ textAlign: 'center', padding: '2rem', background: 'rgba(123, 196, 127, 0.08)', borderRadius: '16px', border: '1px solid rgba(123, 196, 127, 0.3)', maxWidth: '500px', margin: '0 auto' }}>
              <div style={{ width: '150px', height: '150px', margin: '0 auto 1.5rem', borderRadius: '50%', background: 'var(--white-3)', border: '4px solid var(--gold-bright)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {selected.stage1?.imageUrl ? (
                  <img src={selected.stage1.imageUrl} alt={selected.character.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: '3rem' }}>🥚</span>
                )}
              </div>
              <h3 style={{ color: 'var(--primary-dark)', fontSize: '1.5rem', marginBottom: '0.5rem' }}>
                確認選擇夥伴：{selected.character.name}？
              </h3>
              <p style={{ color: 'var(--text-main)', fontSize: '0.95rem', marginBottom: '1.5rem', lineHeight: '1.6' }}>
                夥伴代碼：{selected.character.characterCode} <br />
                稀有度：<span style={{ color: 'var(--gold-bright)', fontWeight: 'bold' }}>{selected.character.rarity}</span> <br />
                類型：{selected.character.type} <br />
                <span style={{ color: 'var(--text-muted)' }}>備註：選擇後將無法自行更改角色。</span>
              </p>

              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                <ParticleButton 
                  className="btn" 
                  style={{ background: '#f5f5f5', color: '#555', border: '1px solid #ccc', borderRadius: '24px' }}
                  onClick={() => setConfirming(false)}
                >
                  返回重選
                </ParticleButton>
                <ParticleButton 
                  className="btn primary-btn" 
                  style={{ borderRadius: '24px', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                  onClick={handleConfirm}
                >
                  <Check size={16} /> 確定選擇，建立契約！
                </ParticleButton>
              </div>
            </div>
          ) : (
            <div className="starter-selection-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '2rem' }}>
              {starters.map((starter) => (
                <div 
                  key={starter.character.id} 
                  className="starter-card"
                  onClick={() => handleSelect(starter)}
                  style={{
                    background: 'white',
                    border: '2px solid rgba(123, 196, 127, 0.25)',
                    borderRadius: '20px',
                    padding: '1.5rem',
                    textAlign: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    boxShadow: '0 8px 24px rgba(76, 175, 80, 0.04)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-6px)';
                    e.currentTarget.style.borderColor = 'var(--primary-color)';
                    e.currentTarget.style.boxShadow = '0 12px 30px rgba(76, 175, 80, 0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.borderColor = 'rgba(123, 196, 127, 0.25)';
                    e.currentTarget.style.boxShadow = '0 8px 24px rgba(76, 175, 80, 0.04)';
                  }}
                >
                  <div style={{ 
                    width: '120px', 
                    height: '120px', 
                    margin: '0 auto 1rem', 
                    borderRadius: '50%', 
                    background: 'var(--white-3)', 
                    border: '3px solid var(--green-2)', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justify: 'center', 
                    overflow: 'hidden',
                    position: 'relative'
                  }}>
                    {starter.stage1?.imageUrl ? (
                      <img src={starter.stage1.imageUrl} alt={starter.character.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span style={{ fontSize: '2.5rem' }}>🥚</span>
                    )}
                    <div style={{ position: 'absolute', bottom: 0, width: '100%', background: 'rgba(0,0,0,0.6)', color: 'white', fontSize: '0.75rem', padding: '0.1rem 0' }}>
                      Stage 1 Egg
                    </div>
                  </div>

                  <h3 style={{ color: 'var(--primary-dark)', fontSize: '1.3rem', margin: '0.5rem 0' }}>
                    {starter.character.name}
                  </h3>
                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginBottom: '1rem' }}>
                    <span style={{ fontSize: '0.75rem', background: '#e8f5e9', color: '#2e7d32', padding: '0.1rem 0.5rem', borderRadius: '8px', fontWeight: 'bold' }}>
                      {starter.character.type}
                    </span>
                    <span style={{ fontSize: '0.75rem', background: '#fff9c4', color: '#f57f17', padding: '0.1rem 0.5rem', borderRadius: '8px', fontWeight: 'bold' }}>
                      {starter.character.rarity}
                    </span>
                  </div>

                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: '1.5', height: '60px', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', marginBottom: '1.5rem' }}>
                    {starter.character.description}
                  </p>

                  <ParticleButton className="btn primary-btn btn-block" style={{ borderRadius: '20px', fontSize: '0.9rem' }}>
                    召喚此夥伴
                  </ParticleButton>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
