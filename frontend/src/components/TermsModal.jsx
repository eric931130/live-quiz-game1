import React from 'react';
import { X, ShieldAlert } from 'lucide-react';
import ParticleButton from './ParticleButton';

export default function TermsModal({ onClose }) {
  return (
    <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }}>
      <div className="modal-content animate-pop-in" style={{ background: '#fff', borderRadius: '24px', padding: '2rem', width: '100%', maxWidth: '700px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', position: 'relative', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', background: 'transparent', border: 'none', cursor: 'pointer', color: '#666' }}>
          <X size={24} />
        </button>

        <h2 style={{ textAlign: 'center', color: 'var(--primary-dark)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
          <ShieldAlert size={28} /> 服務條款與免責聲明
        </h2>

        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '1rem', lineHeight: '1.6', color: '#444', fontSize: '0.95rem' }}>
          <h3 style={{ color: '#333', marginBottom: '0.5rem' }}>第一條：認知與接受條款</h3>
          <p style={{ marginBottom: '1rem' }}>
            歡迎使用「用永續知識，做永續之事」（以下簡稱「本服務」）。本服務係由獨立開發者（以下簡稱「開發者」）所建置與維護。當您註冊、登入或實際使用本服務時，即表示您已閱讀、瞭解並完全同意接受本服務條款之所有內容。如您不同意本條款之任何一部分，請立即停止使用本服務。
          </p>

          <h3 style={{ color: '#333', marginBottom: '0.5rem' }}>第二條：免責聲明 (Disclaimer)</h3>
          <p style={{ marginBottom: '1rem', fontWeight: 'bold', color: '#D32F2F', background: '#FFEBEE', padding: '1rem', borderRadius: '8px' }}>
            本服務係以「現況 (As Is)」及「現有 (As Available)」提供。開發者不對本服務提供任何明示或默示的擔保，包含但不限於商業適售性、特定目的之適用性及未侵害他人權利。
            <br/><br/>
            開發者絕對免責於以下情況（包含但不限於）：
            <br/>1. 系統中斷、網路連線失敗、伺服器當機導致的任何資料遺失或無法使用。
            <br/>2. 您因使用本服務（包含測驗成績、排行榜等功能）所產生的任何直接、間接、附帶、特別、懲罰性或衍生性損害。
            <br/>3. 因駭客攻擊、電腦病毒侵入或發作、政府管制等不可抗力因素導致的個人資料外洩、遺失、被盜用或被竄改。
          </p>

          <h3 style={{ color: '#333', marginBottom: '0.5rem' }}>第三條：使用者行為限制</h3>
          <p style={{ marginBottom: '1rem' }}>
            您承諾絕不為任何非法目的或以任何非法方式使用本服務，並承諾遵守中華民國相關法規及一切使用網際網路之國際慣例。您同意並保證不得利用本服務從事侵害他人權益或違法之行為，包含但不限於：
            <br/>- 破壞、干擾或企圖侵入本服務之伺服器、資料庫及相關安全防護機制。
            <br/>- 利用腳本、機器人或其他自動化工具進行惡意刷分、大量註冊或存取資料。
            <br/>一旦發現上述行為，開發者有權立即終止您的帳號，並保留法律追訴權。
          </p>

          <h3 style={{ color: '#333', marginBottom: '0.5rem' }}>第四條：資料隱私與授權</h3>
          <p style={{ marginBottom: '1rem' }}>
            本服務為非營利與教育展示性質，開發者無意亦不會刻意蒐集不必要之敏感個資。您同意本服務為維持系統運作而儲存您的 Email、暱稱與測驗記錄。開發者有權在不另行通知的情況下，刪除超過一定期限之歷史資料以維護伺服器效能。
          </p>

          <h3 style={{ color: '#333', marginBottom: '0.5rem' }}>第五條：服務變更與終止</h3>
          <p style={{ marginBottom: '1rem' }}>
            開發者保留隨時修改、暫停或永久終止本服務之全部或一部份之權利，且毋須事前通知使用者。對於本服務之暫停或終止，開發者對您或任何第三人均不負擔任何責任。
          </p>

          <h3 style={{ color: '#333', marginBottom: '0.5rem' }}>第六條：管轄法院</h3>
          <p style={{ marginBottom: '1rem' }}>
            本條款之解釋與適用，以及與本條款有關的爭議，均應依照中華民國法律予以處理，並以台灣台北地方法院為第一審管轄法院。使用者同意放棄任何其他管轄權之主張。
          </p>
        </div>

        <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
          <ParticleButton className="btn primary-btn" onClick={onClose} style={{ padding: '0.8rem 2rem', borderRadius: '24px', fontSize: '1.1rem' }}>
            我已瞭解並同意
          </ParticleButton>
        </div>
      </div>
    </div>
  );
}
