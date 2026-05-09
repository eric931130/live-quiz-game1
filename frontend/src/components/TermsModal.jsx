import React from 'react';
import { X, ShieldAlert } from 'lucide-react';
import ParticleButton from './ParticleButton';

export default function TermsModal({ mode = 'terms', onClose }) {
  return (
    <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }}>
      <div className="modal-content animate-pop-in" style={{ background: '#fff', borderRadius: '24px', padding: '2rem', width: '100%', maxWidth: '700px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', position: 'relative', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', background: 'transparent', border: 'none', cursor: 'pointer', color: '#666' }}>
          <X size={24} />
        </button>

        <h2 style={{ textAlign: 'center', color: 'var(--primary-dark)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
          <ShieldAlert size={28} /> {mode === 'terms' ? '服務條款' : mode === 'disclaimer' ? '免責聲明' : mode === 'privacy' ? '隱私權政策' : '聯絡我們'}
        </h2>

        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '1rem', lineHeight: '1.6', color: '#444', fontSize: '0.95rem' }}>
          {(mode === 'terms' || mode === 'disclaimer') && (
            <div style={{ marginBottom: '1rem', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(214, 168, 79, 0.35)', background: 'rgba(214, 168, 79, 0.10)' }}>
              <h3 style={{ color: 'var(--primary-dark)', marginBottom: '0.5rem' }}>題庫內容、智慧財產權與授權提醒</h3>
              <p style={{ marginBottom: '0.75rem' }}>
                使用者必須擁有合法權利或授權，才能上傳、使用、分享、複製、匯出或散布題目內容。題目可能涉及著作權、商標、專利、教材出版社權利、考試機構權利、契約限制、學校政策、隱私或其他法律義務。
              </p>
              <p style={{ marginBottom: 0 }}>
                分享題庫不代表轉讓底層智慧財產權；被允許使用共享題庫，也不代表自動取得編輯、匯出、再散布、販售、公開發布或主張所有權的權利。若有權利投訴、法律疑慮、違反政策或平台風險，平台可基於安全、合規、權利保護與爭議處理需要，審查、限制、暫停、移除或停用相關內容並保留操作紀錄。
              </p>
            </div>
          )}

          {mode === 'terms' && (
            <>
              <h3 style={{ color: '#333', marginBottom: '0.5rem' }}>第一條：認知與接受條款</h3>
              <p style={{ marginBottom: '1rem' }}>
                歡迎使用「師說新宇」（以下簡稱「本服務」）。本服務條款（以下簡稱「本條款」）旨在規範您使用本服務時的權利與義務。當您註冊、登入、使用或繼續使用本服務時，即表示您已閱讀、瞭解並完全同意接受本條款之所有內容。若您為未滿十八歲之未成年人，應於您的家長（或監護人）閱讀、瞭解並同意本條款之所有內容及其後修改變更後，方得使用或繼續使用本服務。
              </p>

              <h3 style={{ color: '#333', marginBottom: '0.5rem' }}>第二條：使用者註冊義務與帳號安全</h3>
              <p style={{ marginBottom: '1rem' }}>
                1. 為了能使用本服務完整功能，您同意提供正確、最新及完整的個人資料（包含但不限於電子郵件與顯示暱稱）。若您提供任何錯誤、不實或不完整的資料，本服務有權暫停或終止您的帳號。
                <br/>2. 您有義務妥善保管您的帳號及密碼，並對使用該帳號所進行的一切活動負責。如發現帳號遭到盜用或有其他任何安全問題發生時，您應立即通知我們。
              </p>

              <h3 style={{ color: '#333', marginBottom: '0.5rem' }}>第三條：使用者行為與規範</h3>
              <p style={{ marginBottom: '1rem' }}>
                您承諾絕不為任何非法目的或以任何非法方式使用本服務，並承諾遵守中華民國相關法規及一切使用網際網路之國際慣例。您同意並保證不得利用本服務從事侵害他人權益或違法之行為，包含但不限於：
                <br/>- 破壞、干擾或企圖侵入本服務之伺服器、資料庫及相關安全防護機制。
                <br/>- 利用腳本、機器人、外掛程式或其他自動化工具進行惡意刷分、大量註冊或存取資料。
                <br/>- 傳輸或散佈電腦病毒、木馬程式或其他可能破壞系統之惡意程式。
                <br/>一旦發現上述行為，我們有權立即終止您的帳號，並保留依法向您請求損害賠償之權利。
              </p>

              <h3 style={{ color: '#333', marginBottom: '0.5rem' }}>第四條：智慧財產權的保護</h3>
              <p style={{ marginBottom: '1rem' }}>
                本服務所使用之軟體或程式、網站上所有內容（包括但不限於文字、圖片、檔案、資訊、資料、網站架構、網站畫面的安排、網頁設計），均由本服務或其他權利人依法擁有其智慧財產權。任何人不得逕自使用、修改、重製、公開播送、改作、散布、發行、公開發表、進行還原工程、解編或反向組譯。
              </p>

              <h3 style={{ color: '#333', marginBottom: '0.5rem' }}>第五條：服務變更與終止</h3>
              <p style={{ marginBottom: '1rem' }}>
                本服務保留於任何時點，不經事先通知，隨時修改、暫停或永久終止本服務之全部或一部份之權利。您同意對於本服務之暫停或終止，本服務對您或任何第三人均不負擔任何賠償或補償責任。
              </p>
              
              <h3 style={{ color: '#333', marginBottom: '0.5rem' }}>第六條：準據法與管轄法院</h3>
              <p style={{ marginBottom: '1rem' }}>
                本條款之解釋與適用，以及與本條款有關的爭議，均應依照中華民國法律予以處理，並以台灣台北地方法院為第一審管轄法院。
              </p>
            </>
          )}

          {mode === 'disclaimer' && (
            <>
              <h3 style={{ color: '#333', marginBottom: '0.5rem' }}>免責聲明 (Disclaimer)</h3>
              <p style={{ marginBottom: '1rem', fontWeight: 'bold', color: '#D32F2F', background: '#FFEBEE', padding: '1rem', borderRadius: '8px' }}>
                本服務係以「現況 (As Is)」及「現有 (As Available)」提供。我們不對本服務提供任何明示或默示的擔保，包含但不限於商業適售性、特定目的之適用性及未侵害他人權利。
                <br/><br/>
                我們絕對免責於以下情況（包含但不限於）：
                <br/>1. <strong>系統中斷與連線失敗</strong>：因電信設備故障、網路壅塞、伺服器當機或進行例行性維護所導致的任何資料遺失、延遲或無法使用。
                <br/>2. <strong>使用風險承擔</strong>：您因使用本服務（包含測驗成績、排行榜等功能）所產生的任何直接、間接、附帶、特別、懲罰性或衍生性損害。我們不保證測驗結果的絕對準確性或其作為評量標準之有效性。
                <br/>3. <strong>不可抗力因素</strong>：因天災、駭客攻擊、電腦病毒侵入或發作、政府管制等不可抗力因素導致的個人資料外洩、遺失、被盜用或被竄改。
                <br/>4. <strong>第三方服務免責</strong>：任何因第三方 API（如 Firebase、Google 服務等）異常或變更所導致的服務中斷或資料毀損。
                <br/>5. <strong>商業損失免責</strong>：若您將本服務用於商業營利用途、企業內部正式考核或具法律效力之評鑑，所有衍生之商業損失、糾紛或賠償責任，均由您自行承擔，本服務不負任何連帶責任。
              </p>
            </>
          )}

          {mode === 'privacy' && (
             <>
              <h3 style={{ color: '#333', marginBottom: '0.5rem' }}>隱私權政策 (Privacy Policy)</h3>
              <p style={{ marginBottom: '1rem' }}>
                 我們極度重視您的隱私權。為了讓您能夠安心的使用本網站的各項服務與資訊，特此向您說明本網站的隱私權保護政策，以保障您的權益。
              </p>
              
              <h4 style={{ color: '#333', marginTop: '1rem' }}>1. 隱私權保護政策的適用範圍</h4>
              <p style={{ marginBottom: '1rem' }}>
                 隱私權保護政策內容，包括本網站如何處理在您使用網站服務時收集到的個人識別資料。隱私權保護政策不適用於本網站以外的相關連結網站，也不適用於非本網站所委託或參與管理的人員。
              </p>

              <h4 style={{ color: '#333', marginTop: '1rem' }}>2. 個人資料的蒐集、處理及利用方式</h4>
              <p style={{ marginBottom: '1rem' }}>
                 - 當您註冊帳號或使用單次匿名登入時，我們會請您提供必要的個人資料（如電子郵件地址、顯示暱稱等）。<br/>
                 - 系統會自動記錄您在網站內的瀏覽與互動歷程（包含答題時間、選項、分數、IP 位址、使用時間、使用的瀏覽器等伺服器日誌）。<br/>
                 - 這些資料將僅用於：維持核心教育功能之運作、記錄您的學習成效、防堵惡意作弊行為，以及進行去識別化的數據分析以改善服務品質。我們保證不會將您的資料用於任何未經授權的商業推銷。
              </p>

              <h4 style={{ color: '#333', marginTop: '1rem' }}>3. 資料之保護與分享</h4>
              <p style={{ marginBottom: '1rem' }}>
                 本網站主機均設有防火牆、防毒系統等相關的各項資訊安全設備及必要的安全防護措施，且僅有經過授權之人員能接觸您的個人資料。本網站絕不會提供、交換、出租或出售任何您的個人資料給其他個人、團體、私人企業或公務機關，但有法律依據或合約義務者，不在此限（例如：配合司法單位合法的調查）。
              </p>
              
              <h4 style={{ color: '#333', marginTop: '1rem' }}>4. Cookie 及 Google 廣告之使用</h4>
              <p style={{ marginBottom: '1rem' }}>
                 為了提供您最佳的服務，本網站會使用 Cookie 技術來儲存並在某些時候追蹤您的資料。此外，本網站採用第三方廣告供應商（如 <strong>Google AdSense</strong>）來投放廣告。Google 會使用 Cookie（如 DART Cookie）來根據您以往在本網站或網際網路上其他網站的瀏覽紀錄，為您放送個人化廣告。使用者可隨時前往 <a href="https://adssettings.google.com/" target="_blank" rel="noreferrer">Google 廣告設定</a> 頁面，選擇停用個人化廣告。
              </p>

              <h4 style={{ color: '#333', marginTop: '1rem' }}>5. 使用者權利</h4>
              <p style={{ marginBottom: '1rem' }}>
                 依據個人資料保護法，您有權向我們請求查詢、閱覽、補充或更正您的個人資料，亦可隨時要求我們停止蒐集、處理、利用或刪除您的帳號與相關數據。如需行使上述權利，請透過本站的「聯絡我們」信箱與我們聯繫。
              </p>
             </>
          )}

          {mode === 'contact' && (
             <>
              <h3 style={{ color: '#333', marginBottom: '0.5rem' }}>聯絡我們 (Contact Us)</h3>
              <p style={{ marginBottom: '1rem' }}>
                 若您對我們的「服務條款」、「隱私權政策」或平台功能有任何疑問、建議，或者是帳號資料刪除請求、商業合作提案，非常歡迎您隨時與我們聯繫！
              </p>
              <div style={{ background: '#f5f5f5', padding: '1.5rem', borderRadius: '12px', marginTop: '1.5rem', border: '1px solid #e0e0e0' }}>
                 <p style={{ margin: '0.5rem 0', fontSize: '1.1rem' }}>
                   <strong>📧 電子郵件 Email：</strong> <br/>
                   <a href="mailto:dragonbabyliu1130@gmail.com" style={{ color: 'var(--primary)', fontWeight: 'bold', textDecoration: 'none' }}>
                     dragonbabyliu1130@gmail.com
                   </a>
                 </p>
                 <p style={{ margin: '1rem 0 0.5rem', fontSize: '1.1rem' }}><strong>📍 服務時間：</strong><br/>週一至週五 09:00 - 18:00 (GMT+8)</p>
                 <p style={{ margin: '1rem 0 0.5rem', fontSize: '1.1rem' }}><strong>🏢 營運單位：</strong><br/>師說新宇教學平台團隊</p>
              </div>
              <p style={{ marginTop: '1.5rem', color: '#666', lineHeight: '1.6' }}>
                 為了加速處理您的問題，來信時請盡量提供您的「註冊 Email」或「遭遇問題的詳細截圖」。我們將會盡快於 1-3 個工作天內回覆您的來信，感謝您的耐心等候與支持。
              </p>
             </>
          )}
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
