import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Brain,
  BookOpen,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  FileSpreadsheet,
  History,
  KeyRound,
  Lock,
  Pencil,
  PlayCircle,
  Plus,
  Rows3,
  Search,
  Share2,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Tags,
  Trash2,
  UploadCloud,
  Wand2,
  Users
} from 'lucide-react';
import { questionBankApi } from '../questionBankApi';

const QUESTION_TYPES = [
  { value: 'multiple_choice', label: '選擇題' },
  { value: 'true_false', label: '是非題' },
  { value: 'short_answer', label: '簡答題' },
  { value: 'fill_blank', label: '填空題' },
  { value: 'matching', label: '配合題' },
  { value: 'essay', label: '申論／開放式回答' }
];

const USAGE_SCENARIOS = [
  '課前暖身',
  '課中即時互動',
  '課後複習',
  '作業',
  '正式小考',
  '考試',
  '分組競賽',
  '補救練習',
  '進階挑戰',
  '學生自主練習'
];

const WIZARD_STEPS = [
  '建立來源',
  '預覽與驗證',
  '補充資料與標籤',
  '權利確認',
  '儲存與下一步'
];

const RIGHTS_NOTICE = '上傳前，請確認你擁有合法權利上傳、使用與分享此題庫。題目內容可能涉及著作權、教材授權、考試機構權利、商標、專利、契約限制、學校政策、隱私或其他法律義務。你有責任確認上傳內容不侵害第三方權利，也不違反適用規範。平台在必要時，得基於權利保護、法律合規、安全、爭議處理、防止濫用或平台營運需要，審查、限制、暫停、移除或停用相關內容。';

function emptyQuestion(type = 'multiple_choice') {
  return {
    type,
    prompt: '',
    optionA: type === 'true_false' ? 'O（是／對）' : '',
    optionB: type === 'true_false' ? 'X（否／錯）' : '',
    optionC: '',
    optionD: '',
    answer: '',
    explanation: '',
    difficulty: 'medium',
    knowledgePoint: '',
    teachingGoal: '',
    estimatedSolvingTime: 60,
    tags: '',
    sourceNote: '',
    rightsRiskStatus: 'unchecked'
  };
}

function splitList(value) {
  return String(value || '')
    .split(/[，,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

const BANK_STATUS_LABELS = {
  active: '啟用中',
  draft: '草稿',
  locked: '已鎖定',
  suspended: '已暫停',
  deleted: '已刪除',
  'rights-review-needed': '需權利審查',
  preview_ready: '預覽已產生'
};

const VISIBILITY_LABELS = {
  private: '私人',
  shared: '已分享',
  organization: '校內可見',
  public: '公開'
};

const RIGHTS_RISK_LABELS = {
  unchecked: '未檢查',
  cleared: '已確認',
  'needs-review': '需審查'
};

function bankStatusText(status) {
  return BANK_STATUS_LABELS[status] || status || '啟用中';
}

function visibilityText(visibility) {
  return VISIBILITY_LABELS[visibility] || visibility || '私人';
}

function rightsRiskText(status) {
  return RIGHTS_RISK_LABELS[status] || status || '未檢查';
}

function RightsNoticeBox({ compact = false }) {
  return (
    <div className="rights-notice-box">
      <div className="rights-notice-icon"><ShieldAlert size={compact ? 18 : 22} /></div>
      <div>
        <strong>權利與合規提醒</strong>
        <p>{RIGHTS_NOTICE}</p>
        {!compact && (
          <p>分享題庫不代表轉讓智慧財產權。取得共享使用權，也不代表自動取得編輯、匯出、再散布、販售、公開發布或主張所有權的權利。若內容包含學生個資，請在上傳前移除。</p>
        )}
      </div>
    </div>
  );
}

function UploadAcknowledgementCheckbox({ checked, onChange, verb = '上傳、使用、分享、匯出或複製' }) {
  return (
    <label className="ack-checkbox">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>我確認我擁有{verb}此題庫所需的權利或授權，並理解相關法律與平台政策風險。</span>
    </label>
  );
}

function PermissionBadge({ bank }) {
  const permission = bank.permission || {};
  const badges = [permission.isOwner ? '我擁有' : '分享給我'];
  if (!permission.isOwner) badges.push('唯讀權限', '僅可使用');
  if (permission.canExport) badges.push('允許匯出');
  if (permission.canCopy) badges.push('允許複製');
  if (bank.status === 'locked') badges.push('平台已鎖定');
  if (bank.status === 'rights-review-needed' || bank.rightsRiskStatus === 'needs-review') badges.push('需權利審查');

  return (
    <div className="permission-badge-row">
      {badges.map((badge) => (
        <span className={`permission-badge ${permission.isOwner ? 'owner' : 'shared'}`} key={badge}>
          {permission.isOwner ? <KeyRound size={14} /> : <Eye size={14} />}
          {badge}
        </span>
      ))}
    </div>
  );
}

function WizardStepper({ step, setStep, preview }) {
  return (
    <div className="qb-wizard-stepper">
      {WIZARD_STEPS.map((label, index) => {
        const enabled = index === 0 || preview || index <= step;
        return (
          <button key={label} className={step === index ? 'active' : step > index ? 'complete' : ''} disabled={!enabled} onClick={() => setStep(index)}>
            <span>{index + 1}</span>
            {label}
          </button>
        );
      })}
    </div>
  );
}

function ImportValidationPanel({ preview }) {
  if (!preview) return null;
  const { summary } = preview;
  const metrics = [
    ['偵測總列數', summary.totalRows],
    ['有效題目', summary.validQuestions],
    ['無效列', summary.invalidRows],
    ['疑似重複題', summary.duplicateQuestions],
    ['缺少解析', summary.missingExplanations || 0],
    ['需要檢查', summary.needsReview || 0],
    ['可能權利風險', summary.possibleRightsRisk || 0],
    ['即將建立', summary.questionsToCreate]
  ];

  return (
    <div className="import-validation-panel phase-one-summary">
      {metrics.map(([label, value]) => (
        <div key={label}>
          <strong>{value}</strong>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

function EditablePreviewTable({ preview, onChange }) {
  if (!preview) return null;

  const update = (index, field, value) => {
    const nextRows = preview.rows.map((row, rowIndex) => (
      rowIndex === index ? { ...row, question: { ...row.question, [field]: value } } : row
    ));
    onChange({ ...preview, rows: nextRows });
  };

  const updateOption = (index, option, value) => {
    const nextRows = preview.rows.map((row, rowIndex) => (
      rowIndex === index
        ? { ...row, question: { ...row.question, options: { ...row.question.options, [option]: value } } }
        : row
    ));
    onChange({ ...preview, rows: nextRows });
  };

  return (
    <div className="import-preview-table-wrap">
      <table className="import-preview-table">
        <thead>
          <tr>
            <th>列</th>
            <th>題型</th>
            <th>題目</th>
            <th>A</th>
            <th>B</th>
            <th>C</th>
            <th>D</th>
            <th>答案</th>
            <th>知識點／目標</th>
            <th>章節／小節</th>
            <th>驗證</th>
          </tr>
        </thead>
        <tbody>
          {preview.rows.map((row, index) => (
            <tr key={`${row.rowNumber}-${index}`} className={!row.valid ? 'has-error' : row.warnings.length ? 'has-warning' : ''}>
              <td>{row.rowNumber}</td>
              <td>
                <select value={row.question.type} onChange={(event) => update(index, 'type', event.target.value)}>
                  {QUESTION_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                </select>
              </td>
              <td><textarea value={row.question.prompt} onChange={(event) => update(index, 'prompt', event.target.value)} /></td>
              {['A', 'B', 'C', 'D'].map((option) => (
                <td key={option}><input value={row.question.options?.[option] || ''} onChange={(event) => updateOption(index, option, event.target.value)} /></td>
              ))}
              <td><input value={row.question.answer} onChange={(event) => update(index, 'answer', event.target.value)} /></td>
              <td>
                <input value={row.question.knowledgePoint || ''} onChange={(event) => update(index, 'knowledgePoint', event.target.value)} placeholder="知識點" />
                <input value={row.question.teachingGoal || ''} onChange={(event) => update(index, 'teachingGoal', event.target.value)} placeholder="教學目標" />
              </td>
              <td>
                <input value={row.question.chapter || ''} onChange={(event) => update(index, 'chapter', event.target.value)} placeholder="章節" />
                <input value={row.question.section || ''} onChange={(event) => update(index, 'section', event.target.value)} placeholder="小節" />
              </td>
              <td>
                {row.errors.map((error) => <span className="validation-chip error" key={error.message}>{error.message}</span>)}
                {row.warnings.map((warning) => <span className="validation-chip warning" key={warning.message}>{warning.message}</span>)}
                {row.valid && !row.warnings.length && <span className="validation-chip ok">可匯入</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QuestionBankCard({ bank, selected, onSelect, onDelete, onShare, onCopy, onExport, onCreateActivity }) {
  const permission = bank.permission || {};
  const readonlyReason = permission.isOwner
    ? ''
    : '你可以使用此共享題庫，但不能修改原始內容。';

  return (
    <article className={`question-bank-card ${selected ? 'selected' : ''}`}>
      <div className="question-bank-card-head">
        <div>
          <PermissionBadge bank={bank} />
          <h4>{bank.title || bank.name}</h4>
          <p>{bank.description || '尚未填寫描述'}</p>
        </div>
        <span className={`bank-status ${bank.status}`}>{bankStatusText(bank.status)}</span>
      </div>
      <div className="question-bank-meta">
        <span>{bank.questions?.length || 0} 題</span>
        <span>{bank.subject || '未設定科目'}</span>
        <span>{bank.gradeLevel || '未設定年級'}</span>
        <span>{bank.course || '未設定課程'}</span>
        <span>{visibilityText(bank.visibility)}</span>
      </div>
      <div className="permission-note">
        {permission.notice || readonlyReason}
        {bank.ownerTeacherName && !permission.isOwner ? ` 擁有者：${bank.ownerTeacherName}` : ''}
      </div>
      <div className="bank-actions">
        <button onClick={() => onSelect(bank)}><BookOpen size={16} /> 使用</button>
        <button disabled={!permission.canUse} title={!permission.canUse ? '你沒有使用此題庫的權限。' : '建立活動'} onClick={() => onCreateActivity(bank)}><PlayCircle size={16} /> 產生活動</button>
        <button disabled={!permission.canShare} title={!permission.canShare ? '只有擁有者可以修改分享設定。' : '分享'} onClick={() => onShare(bank)}><Share2 size={16} /> 分享</button>
        <button disabled={!permission.canExport} title={!permission.canExport ? '擁有者未開放匯出。' : '匯出'} onClick={() => onExport(bank)}><Download size={16} /> 匯出</button>
        <button disabled={!permission.canCopy} title={!permission.canCopy ? '擁有者未開放複製。' : '複製到我的題庫'} onClick={() => onCopy(bank)}><Copy size={16} /> 複製</button>
        <button className="danger" disabled={!permission.canDelete} title={!permission.canDelete ? '只有擁有者可以刪除此題庫。' : '軟刪除'} onClick={() => onDelete(bank.id)}><Trash2 size={16} /> 刪除</button>
      </div>
    </article>
  );
}

function ShareModal({ user, bank, onClose, onDone }) {
  const [teacherId, setTeacherId] = useState('');
  const [canExport, setCanExport] = useState(false);
  const [canCopy, setCanCopy] = useState(false);
  const [expiresAt, setExpiresAt] = useState('');
  const [ack, setAck] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!bank) return null;

  const submit = async () => {
    setSaving(true);
    try {
      await questionBankApi.share(user, bank.id, {
        sharedWithTeacherId: teacherId,
        sharedWithTeacherName: teacherId,
        permissionLevel: canExport ? 'use_export' : canCopy ? 'use_copy' : 'use_readonly',
        canExport,
        canCopy,
        expiresAt: expiresAt || null,
        legalAcknowledged: ack
      });
      await onDone();
      onClose();
    } catch (error) {
      alert(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="qb-modal-backdrop">
      <div className="qb-modal">
        <h3><Share2 size={20} /> 分享題庫</h3>
        <RightsNoticeBox compact />
        <label>老師 ID 或 Email</label>
        <input value={teacherId} onChange={(event) => setTeacherId(event.target.value)} placeholder="teacher@example.com" />
        <div className="share-permissions">
          <label><input type="checkbox" checked readOnly /> 僅使用／唯讀</label>
          <label><input type="checkbox" checked={canExport} onChange={(event) => setCanExport(event.target.checked)} /> 使用＋匯出</label>
          <label><input type="checkbox" checked={canCopy} onChange={(event) => setCanCopy(event.target.checked)} /> 使用＋複製</label>
        </div>
        <label>到期日（選填）</label>
        <input type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
        <UploadAcknowledgementCheckbox checked={ack} onChange={setAck} verb="share" />
        <div className="qb-modal-actions">
          <button onClick={onClose}>取消</button>
          <button className="primary-btn" disabled={!teacherId.trim() || !ack || saving} onClick={submit}>確認分享</button>
        </div>
      </div>
    </div>
  );
}

function ExportModal({ user, bank, onClose }) {
  const [ack, setAck] = useState(false);

  if (!bank) return null;

  const doExport = async () => {
    try {
      const blob = await questionBankApi.exportBank(user, bank.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${bank.title || bank.name || 'question-bank'}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
      onClose();
    } catch (error) {
      alert(error.message);
    }
  };

  return (
    <div className="qb-modal-backdrop">
      <div className="qb-modal">
        <h3><Download size={20} /> 匯出題庫</h3>
        <RightsNoticeBox compact />
        <p className="permission-note">匯出不代表取得再散布、販售、公開發布或主張所有權的權利。請再次確認授權範圍。</p>
        <UploadAcknowledgementCheckbox checked={ack} onChange={setAck} verb="export" />
        <div className="qb-modal-actions">
          <button onClick={onClose}>取消</button>
          <button className="primary-btn" disabled={!ack} onClick={doExport}>確認匯出</button>
        </div>
      </div>
    </div>
  );
}

function ActivityGeneratorModal({ user, bank, onClose, onGenerated }) {
  const [settings, setSettings] = useState({
    activityType: 'live_quiz',
    title: `${bank?.title || bank?.name || '題庫'} 即時測驗`,
    questionCount: Math.min(bank?.questions?.length || 10, 10),
    difficulty: 'any',
    questionType: 'any',
    knowledgePoint: '',
    timeLimit: 60,
    randomize: true,
    showAnswer: true,
    showExplanation: true,
    allowRetry: false,
    leaderboard: true,
    participantMode: 'individual',
    anonymous: false
  });
  const [ack, setAck] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activity, setActivity] = useState(null);

  if (!bank) return null;

  const update = (field, value) => {
    setSettings((current) => ({ ...current, [field]: value }));
  };

  const createActivity = async () => {
    setSaving(true);
    try {
      const result = await questionBankApi.createActivity(user, bank.id, settings);
      setActivity(result);
    } catch (error) {
      alert(error.message);
    } finally {
      setSaving(false);
    }
  };

  const useActivity = () => {
    onGenerated?.(activity);
    onClose();
  };

  return (
    <div className="qb-modal-backdrop">
      <div className="qb-modal activity-generator-modal">
        <h3><PlayCircle size={20} /> 從題庫產生活動</h3>
        <RightsNoticeBox compact />
        <div className="activity-generator-grid">
          <label>
            活動標題
            <input value={settings.title} onChange={(event) => update('title', event.target.value)} />
          </label>
          <label>
            活動類型
            <select value={settings.activityType} onChange={(event) => update('activityType', event.target.value)}>
              <option value="quick_warmup">快速暖身</option>
              <option value="live_quiz">即時測驗</option>
              <option value="homework">作業</option>
              <option value="formal_quiz">正式小考</option>
              <option value="review_practice">複習練習</option>
              <option value="group_battle">分組競賽</option>
              <option value="remedial_task">補救學習任務</option>
              <option value="challenge_task">挑戰任務</option>
            </select>
          </label>
          <label>
            題數
            <input type="number" min="1" max="100" value={settings.questionCount} onChange={(event) => update('questionCount', Number(event.target.value))} />
          </label>
          <label>
            時間限制（秒）
            <input type="number" min="10" max="600" value={settings.timeLimit} onChange={(event) => update('timeLimit', Number(event.target.value))} />
          </label>
          <label>
            難度
            <select value={settings.difficulty} onChange={(event) => update('difficulty', event.target.value)}>
              <option value="any">全部</option>
              <option value="easy">簡單</option>
              <option value="medium">中等</option>
              <option value="hard">困難</option>
            </select>
          </label>
          <label>
            題型
            <select value={settings.questionType} onChange={(event) => update('questionType', event.target.value)}>
              <option value="any">全部</option>
              {QUESTION_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
          </label>
          <label>
            知識點篩選
            <input value={settings.knowledgePoint} onChange={(event) => update('knowledgePoint', event.target.value)} placeholder="留空代表全部" />
          </label>
          <label>
            參與模式
            <select value={settings.participantMode} onChange={(event) => update('participantMode', event.target.value)}>
              <option value="individual">個人模式</option>
              <option value="group">分組模式</option>
            </select>
          </label>
        </div>
        <div className="activity-toggle-grid">
          <label><input type="checkbox" checked={settings.randomize} onChange={(event) => update('randomize', event.target.checked)} /> 隨機出題</label>
          <label><input type="checkbox" checked={settings.showAnswer} onChange={(event) => update('showAnswer', event.target.checked)} /> 顯示答案</label>
          <label><input type="checkbox" checked={settings.showExplanation} onChange={(event) => update('showExplanation', event.target.checked)} /> 顯示解析</label>
          <label><input type="checkbox" checked={settings.allowRetry} onChange={(event) => update('allowRetry', event.target.checked)} /> 允許重答</label>
          <label><input type="checkbox" checked={settings.leaderboard} onChange={(event) => update('leaderboard', event.target.checked)} /> 啟用排行榜</label>
          <label><input type="checkbox" checked={settings.anonymous} onChange={(event) => update('anonymous', event.target.checked)} /> 匿名參與</label>
        </div>
        <UploadAcknowledgementCheckbox checked={ack} onChange={setAck} verb="use this question bank to create classroom activities from" />

        {activity && (
          <div className="activity-result-card">
            <strong>{activity.title}</strong>
            <span>代碼：{activity.code} · {activity.questionCount} 題 · {activity.activityType}</span>
            <p>已建立草稿活動，並記錄題庫使用權限與操作紀錄。</p>
          </div>
        )}

        <div className="qb-modal-actions">
          <button onClick={onClose}>取消</button>
          {!activity ? (
            <button className="primary-btn" disabled={!ack || saving} onClick={createActivity}>
              {saving ? '建立中...' : '產生活動'}
            </button>
          ) : (
            <button className="primary-btn" onClick={useActivity}>套用到教師控制台</button>
          )}
        </div>
      </div>
    </div>
  );
}

function AuditPanel({ user, bank }) {
  const [logs, setLogs] = useState([]);
  const [open, setOpen] = useState(false);

  const load = async () => {
    try {
      const result = await questionBankApi.audit(user, bank.id);
      setLogs(result);
      setOpen(true);
    } catch (error) {
      alert(error.message);
    }
  };

  if (!bank?.permission?.isOwner && !bank?.permission?.isAdmin) return null;

  return (
    <div className="audit-panel">
      <button onClick={load}><History size={16} /> 查看操作紀錄</button>
      {open && (
        <div className="audit-log-list">
          {logs.slice(0, 8).map((log) => (
            <div key={log.id}>
              <strong>{log.actionType}</strong>
              <span>{log.actorRole} / {log.actorUserId}</span>
              <small>{new Date(log.createdAt).toLocaleString()}</small>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DistributionList({ title, items }) {
  const entries = Object.entries(items || {});

  return (
    <div className="ai-distribution-card">
      <strong>{title}</strong>
      {entries.length === 0 && <span>尚無資料</span>}
      {entries.map(([label, count]) => (
        <div key={label} className="distribution-row">
          <span>{label}</span>
          <b>{count}</b>
        </div>
      ))}
    </div>
  );
}

function AIHealthReportPanel({ user, bank }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);

  const runHealthReport = async () => {
    setLoading(true);
    try {
      const result = await questionBankApi.healthReport(user, bank.id);
      setReport(result);
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ai-health-panel">
      <div className="ai-panel-header">
        <div>
          <h4><Brain size={18} /> AI 題庫健康報告</h4>
          <p>以規則式 AI 輔助檢查格式、重複、解析、知識點覆蓋與可能權利風險。</p>
        </div>
        <button className="secondary-gold-outline-btn" onClick={runHealthReport} disabled={loading}>
          <Sparkles size={16} /> {loading ? '檢查中...' : '執行健康檢查'}
        </button>
      </div>

      {report && (
        <>
          <div className="health-summary-grid">
            <div className="health-score-card">
              <span>品質分數</span>
              <strong>{report.qualityScore}</strong>
              <small>{report.classroomReadiness?.estimatedUsability}</small>
            </div>
            <div><span>總題數</span><strong>{report.totals?.totalQuestions || 0}</strong></div>
            <div><span>有效題數</span><strong>{report.totals?.validQuestions || 0}</strong></div>
            <div><span>需檢查</span><strong>{report.totals?.needsReview || 0}</strong></div>
            <div><span>疑似重複</span><strong>{report.totals?.duplicateCandidates || 0}</strong></div>
            <div><span>缺少解析</span><strong>{report.totals?.missingExplanations || 0}</strong></div>
            <div><span>可能權利風險</span><strong>{report.totals?.possibleRightsRisk || 0}</strong></div>
            <div><span>個資疑慮</span><strong>{report.totals?.possiblePersonalData || 0}</strong></div>
          </div>

          <div className="ai-distribution-grid">
            <DistributionList title="難度分布" items={report.difficultyDistribution} />
            <DistributionList title="題型分布" items={report.typeDistribution} />
            <div className="ai-distribution-card">
              <strong>知識點覆蓋</strong>
              <span>{report.knowledgeCoverage?.coverageRate || 0}% 題目已標示</span>
              <small>{report.knowledgeCoverage?.coveredQuestions || 0} / {report.totals?.totalQuestions || 0}</small>
            </div>
            <div className="ai-distribution-card">
              <strong>教學目標覆蓋</strong>
              <span>{report.teachingGoalCoverage?.coverageRate || 0}% 題目已標示</span>
              <small>{report.teachingGoalCoverage?.coveredQuestions || 0} / {report.totals?.totalQuestions || 0}</small>
            </div>
          </div>

          <div className="ai-suggestion-list">
            {(report.suggestions || []).map((suggestion) => (
              <p key={suggestion}><CheckCircle2 size={15} /> {suggestion}</p>
            ))}
          </div>

          <p className="ai-disclaimer">{report.disclaimer}</p>
        </>
      )}
    </div>
  );
}

function AIAssistantPanel({ user, bank, onApplied }) {
  const [preview, setPreview] = useState(null);
  const [loadingAction, setLoadingAction] = useState('');
  const [applyAck, setApplyAck] = useState(false);
  const [teacherConfirmed, setTeacherConfirmed] = useState(false);
  const [applying, setApplying] = useState(false);
  const canEdit = Boolean(bank?.permission?.canEdit);
  const actions = [
    { type: 'auto_tag', label: '自動標籤題目' },
    { type: 'generate_explanations', label: '生成解析' },
    { type: 'improve_clarity', label: '改善題目清楚度' },
    { type: 'check_rights_risk', label: '檢查權利風險' }
  ];

  const runPreview = async (actionType) => {
    setLoadingAction(actionType);
    try {
      const result = await questionBankApi.aiPreview(user, bank.id, actionType);
      setPreview(result);
      setApplyAck(false);
      setTeacherConfirmed(false);
    } catch (error) {
      alert(error.message);
    } finally {
      setLoadingAction('');
    }
  };

  const applyPreview = async () => {
    if (!preview) return;
    setApplying(true);
    try {
      await questionBankApi.applyAiPreview(user, bank.id, {
        actionType: preview.actionType,
        legalAcknowledged: applyAck,
        teacherConfirmed
      });
      setPreview(null);
      setApplyAck(false);
      setTeacherConfirmed(false);
      onApplied?.();
    } catch (error) {
      alert(error.message);
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="ai-assistant-panel">
      <div className="ai-panel-header">
        <div>
          <h4><Wand2 size={18} /> AI 助理預覽</h4>
          <p>AI 建議只會在老師確認後寫入，並建立版本紀錄與操作紀錄。</p>
        </div>
      </div>

      <div className="ai-action-grid">
        {actions.map((action) => (
          <button
            key={action.type}
            className="dark-action-btn"
            disabled={!canEdit || Boolean(loadingAction)}
            title={!canEdit ? '只有擁有者可以對此題庫執行 AI 修改預覽。' : '產生預覽'}
            onClick={() => runPreview(action.type)}
          >
            <Sparkles size={15} /> {loadingAction === action.type ? '產生中...' : action.label}
          </button>
        ))}
      </div>

      {!canEdit && (
        <p className="permission-note">你可以使用共享題庫，但不能對原始題庫執行 AI 修改預覽。</p>
      )}

      {preview && (
        <div className="ai-preview-list">
          <div className="ai-preview-heading">
            <strong>{preview.actionType}</strong>
            <span>{bankStatusText(preview.status)}</span>
          </div>
          {(preview.items || []).map((item) => (
            <div key={item.questionId} className="ai-preview-item">
              <span>題目 {item.questionId}</span>
              <div className="before-after-grid">
                <div>
                  <strong>修改前</strong>
                  <p>{item.before?.prompt}</p>
                  <small>{item.before?.explanation || '尚無解析'}</small>
                </div>
                <div>
                  <strong>修改後</strong>
                  <p>{item.after?.prompt}</p>
                  <small>{item.after?.explanation || item.after?.note || '無文字變更'}</small>
                </div>
              </div>
            </div>
          ))}
          <p className="ai-disclaimer">{preview.disclaimer}</p>
          <div className="ai-apply-confirmation">
            <RightsNoticeBox compact />
            <label className="ack-checkbox">
              <input type="checkbox" checked={teacherConfirmed} onChange={(event) => setTeacherConfirmed(event.target.checked)} />
              <span>我已檢視 AI 輔助的修改前後預覽，並確認要將這些變更套用到我的原始題庫。</span>
            </label>
            <UploadAcknowledgementCheckbox checked={applyAck} onChange={setApplyAck} verb="套用 AI 輔助變更到" />
            <button
              className="primary-btn"
              disabled={!teacherConfirmed || !applyAck || applying}
              onClick={applyPreview}
            >
              <CheckCircle2 size={16} /> {applying ? '套用中...' : '確認套用並建立新版本'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function QuestionBankVersionHistory({ user, bank }) {
  const [versions, setVersions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [comparison, setComparison] = useState(null);
  const [restoreReason, setRestoreReason] = useState('還原先前題庫版本');

  const load = async () => {
    setLoading(true);
    try {
      const result = await questionBankApi.versions(user, bank.id);
      setVersions(result);
      setOpen(true);
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  const compare = async (versionId) => {
    setLoading(true);
    try {
      const result = await questionBankApi.compareVersion(user, bank.id, versionId);
      setComparison(result);
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  const restore = async (versionId) => {
    if (!window.confirm('確定要將題庫內容還原到此版本嗎？系統會建立新的版本與 audit log。')) return;
    setLoading(true);
    try {
      await questionBankApi.restoreVersion(user, bank.id, versionId, restoreReason);
      await load();
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  if (!bank?.permission?.isOwner && !bank?.permission?.isAdmin) return null;

  return (
    <div className="version-history-panel">
      <div className="ai-panel-header">
        <div>
          <h4><History size={18} /> 版本歷史</h4>
          <p>每次 AI 套用與重要變更都會保留 snapshot，方便後續審查與回溯。</p>
        </div>
        <button className="secondary-gold-outline-btn" onClick={load} disabled={loading}>
          {loading ? '讀取中...' : '查看版本'}
        </button>
      </div>
      {open && (
        <div className="version-list">
          <label className="version-restore-reason">
            還原原因
            <input value={restoreReason} onChange={(event) => setRestoreReason(event.target.value)} />
          </label>
          {versions.map((version) => (
            <div key={version.id} className="version-row">
              <strong>{version.versionName || version.versionNumber}</strong>
              <span>{version.changeSummary}</span>
              <small>{new Date(version.createdAt).toLocaleString()}</small>
              <div className="version-actions">
                <button onClick={() => compare(version.id)} disabled={loading}>比較</button>
                <button onClick={() => restore(version.id)} disabled={loading || !restoreReason.trim()}>還原</button>
              </div>
            </div>
          ))}
          {versions.length === 0 && <p className="empty-text">尚無版本紀錄。</p>}
          {comparison && (
            <div className="version-comparison-panel">
              <h5>版本比較：{comparison.version?.versionName || comparison.version?.versionNumber}</h5>
              <div className="version-comparison-grid">
                <div><span>補充資料變更</span><strong>{comparison.comparison?.metadataChanges?.length || 0}</strong></div>
                <div><span>題目變更</span><strong>{comparison.comparison?.questionSummary?.changedQuestionCount || 0}</strong></div>
                <div><span>目標版本新增</span><strong>{comparison.comparison?.questionSummary?.addedInTargetCount || 0}</strong></div>
                <div><span>目標版本移除</span><strong>{comparison.comparison?.questionSummary?.removedInTargetCount || 0}</strong></div>
              </div>
              <div className="version-diff-list">
                {(comparison.comparison?.metadataChanges || []).slice(0, 8).map((change) => (
                  <p key={change.field}><strong>{change.field}</strong> 目前：{String(change.current)} / 目標：{String(change.target)}</p>
                ))}
                {(comparison.comparison?.changedQuestions || []).slice(0, 8).map((question) => (
                  <p key={question.id}><strong>{question.prompt || question.id}</strong> 已變更：{question.changedFields.join(', ')}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ClassWeaknessReportPanel({ user, bank }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const result = await questionBankApi.weaknessReport(user, bank.id);
      setReport(result);
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="class-weakness-panel">
      <div className="ai-panel-header">
        <div>
          <h4><BarChart3 size={18} /> 班級弱點報告</h4>
          <p>即時課堂作答會回流成題目成效與班級弱點摘要；共享題庫仍只統計你自己課堂的使用資料。</p>
        </div>
        <button className="secondary-gold-outline-btn" disabled={!bank?.permission?.canUse || loading} onClick={load}>
          {loading ? '整理中...' : '查看弱點報告'}
        </button>
      </div>

      {report && (
        <>
          <div className="weakness-summary-grid">
            <div>
              <span>總作答數</span>
              <strong>{report.totalAnswers}</strong>
            </div>
            <div>
              <span>錯誤率</span>
              <strong>{report.incorrectRate}%</strong>
            </div>
            <div>
              <span>最常錯概念</span>
              <strong>{report.mostMissedConcept?.knowledgePoint || '尚無資料'}</strong>
            </div>
          </div>
          <div className="weakness-action-card">
            <strong>建議教學行動</strong>
            <p>{report.suggestedAction}</p>
            <small>建議後續活動：{report.recommendedFollowUp}</small>
          </div>
          <div className="weakness-concept-list">
            {(report.concepts || []).slice(0, 6).map((concept) => (
              <div key={concept.knowledgePoint}>
                <span>{concept.knowledgePoint}</span>
                <strong>{concept.incorrectRate}%</strong>
                <small>{concept.incorrect} / {concept.total} 錯誤</small>
              </div>
            ))}
            {(!report.concepts || report.concepts.length === 0) && <p className="empty-text">尚未累積即時課堂作答資料。</p>}
          </div>
        </>
      )}
    </div>
  );
}

export default function QuestionBankDashboard({
  user,
  banks,
  selectedBankId,
  onReload,
  onSelectBank,
  onDeleteBank,
  onDeleteQuestion,
  onActivityGenerated
}) {
  const [view, setView] = useState('library');
  const [wizardStep, setWizardStep] = useState(0);
  const [createMode, setCreateMode] = useState('excel');
  const [metadata, setMetadata] = useState({
    title: '',
    description: '',
    subject: '',
    gradeLevel: '',
    course: '',
    unit: '',
    chapter: '',
    knowledgePoints: '',
    tags: '',
    difficulty: 'medium',
    rightsRiskStatus: 'unchecked',
    usageScenarios: ['課中即時互動']
  });
  const [filters, setFilters] = useState({ search: '', ownership: 'all', subject: '', difficulty: '' });
  const [preview, setPreview] = useState(null);
  const [manualQuestion, setManualQuestion] = useState(emptyQuestion());
  const [pasteText, setPasteText] = useState('');
  const [batchQuestions, setBatchQuestions] = useState([emptyQuestion(), emptyQuestion(), emptyQuestion()]);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [shareBank, setShareBank] = useState(null);
  const [exportBank, setExportBank] = useState(null);
  const [activityBank, setActivityBank] = useState(null);
  const [lastSavedBank, setLastSavedBank] = useState(null);

  const selectedBank = banks.find((bank) => bank.id === selectedBankId);
  const filteredBanks = useMemo(() => {
    return banks.filter((bank) => {
      const term = filters.search.trim().toLowerCase();
      const haystack = [bank.title, bank.name, bank.subject, bank.course, bank.chapter, ...(bank.tags || [])].join(' ').toLowerCase();
      const ownershipOk = filters.ownership === 'all' || (filters.ownership === 'owned' ? bank.permission?.isOwner : !bank.permission?.isOwner);
      const subjectOk = !filters.subject || bank.subject === filters.subject;
      const difficultyOk = !filters.difficulty || (bank.questions || []).some((question) => question.difficulty === filters.difficulty);
      return (!term || haystack.includes(term)) && ownershipOk && subjectOk && difficultyOk;
    });
  }, [banks, filters]);
  const ownedBanks = filteredBanks.filter((bank) => bank.permission?.isOwner);
  const sharedBanks = filteredBanks.filter((bank) => !bank.permission?.isOwner);
  const subjects = Array.from(new Set(banks.map((bank) => bank.subject).filter(Boolean)));

  const defaultMetadata = () => ({
    ...metadata,
    knowledgePoints: splitList(metadata.knowledgePoints),
    tags: splitList(metadata.tags),
    difficulty: metadata.difficulty || 'medium',
    usageScenarios: metadata.usageScenarios || []
  });

  const resetWizard = () => {
    setPreview(null);
    setAck(false);
    setLastSavedBank(null);
    setWizardStep(0);
  };

  const previewFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const result = await questionBankApi.previewExcel(user, file, defaultMetadata());
      setPreview(result);
      setWizardStep(1);
    } catch (error) {
      alert(error.message);
    } finally {
      setBusy(false);
    }
  };

  const revalidatePreview = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const result = await questionBankApi.validate(user, preview.rows.map((row) => row.question), defaultMetadata());
      setPreview(result);
    } catch (error) {
      alert(error.message);
    } finally {
      setBusy(false);
    }
  };

  const makePreview = async (questions) => {
    const rows = questions.filter((question) => question.prompt?.trim());
    if (!rows.length) return alert('請先輸入至少一題。');
    setBusy(true);
    try {
      const result = await questionBankApi.validate(user, rows, defaultMetadata());
      setPreview(result);
      setWizardStep(1);
    } catch (error) {
      alert(error.message);
    } finally {
      setBusy(false);
    }
  };

  const parsePaste = () => {
    const questions = pasteText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [prompt, optionA = '', optionB = '', optionC = '', optionD = '', answer = ''] = line.split(/\t|\|/).map((item) => item.trim());
        return { ...emptyQuestion(optionC || optionD ? 'multiple_choice' : 'true_false'), prompt, optionA, optionB, optionC, optionD, answer };
      });
    makePreview(questions);
  };

  const commitPreview = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const bank = await questionBankApi.commitImport(user, {
        metadata: defaultMetadata(),
        rows: preview.rows,
        legalAcknowledged: ack
      });
      await onReload();
      onSelectBank(bank);
      setLastSavedBank(bank);
      setWizardStep(4);
    } catch (error) {
      alert(error.message);
    } finally {
      setBusy(false);
    }
  };

  const copyBank = async (bank) => {
    try {
      await questionBankApi.copy(user, bank.id);
      await onReload();
    } catch (error) {
      alert(error.message);
    }
  };

  const updateManual = (field, value) => {
    const next = { ...manualQuestion, [field]: value };
    if (field === 'type' && value === 'true_false') {
      next.optionA = 'O（是／對）';
      next.optionB = 'X（否／錯）';
      next.optionC = '';
      next.optionD = '';
    }
    setManualQuestion(next);
  };

  const toggleScenario = (scenario) => {
    const existing = metadata.usageScenarios || [];
    setMetadata({
      ...metadata,
      usageScenarios: existing.includes(scenario)
        ? existing.filter((item) => item !== scenario)
        : [...existing, scenario]
    });
  };

  const renderMetadata = () => (
    <div className="qb-metadata-grid">
      <input placeholder="題庫名稱（必填）" value={metadata.title} onChange={(event) => setMetadata({ ...metadata, title: event.target.value })} />
      <input placeholder="科目" value={metadata.subject} onChange={(event) => setMetadata({ ...metadata, subject: event.target.value })} />
      <input placeholder="年級" value={metadata.gradeLevel} onChange={(event) => setMetadata({ ...metadata, gradeLevel: event.target.value })} />
      <input placeholder="課程" value={metadata.course} onChange={(event) => setMetadata({ ...metadata, course: event.target.value })} />
      <input placeholder="單元" value={metadata.unit} onChange={(event) => setMetadata({ ...metadata, unit: event.target.value })} />
      <input placeholder="章節" value={metadata.chapter} onChange={(event) => setMetadata({ ...metadata, chapter: event.target.value })} />
      <input placeholder="知識點，以逗號分隔" value={metadata.knowledgePoints} onChange={(event) => setMetadata({ ...metadata, knowledgePoints: event.target.value })} />
      <input placeholder="標籤，以逗號分隔" value={metadata.tags} onChange={(event) => setMetadata({ ...metadata, tags: event.target.value })} />
      <select value={metadata.difficulty} onChange={(event) => setMetadata({ ...metadata, difficulty: event.target.value })}>
        <option value="easy">簡單</option>
        <option value="medium">中等</option>
        <option value="hard">困難</option>
      </select>
      <select value={metadata.rightsRiskStatus} onChange={(event) => setMetadata({ ...metadata, rightsRiskStatus: event.target.value })}>
        <option value="unchecked">權利狀態：尚未檢查</option>
        <option value="cleared">權利狀態：已確認授權</option>
        <option value="needs-review">權利狀態：需要檢查</option>
      </select>
      <textarea placeholder="題庫描述" value={metadata.description} onChange={(event) => setMetadata({ ...metadata, description: event.target.value })} />
      <div className="usage-scenario-picker">
        {USAGE_SCENARIOS.map((scenario) => (
          <label key={scenario}>
            <input type="checkbox" checked={(metadata.usageScenarios || []).includes(scenario)} onChange={() => toggleScenario(scenario)} />
            {scenario}
          </label>
        ))}
      </div>
    </div>
  );

  const renderSourceStep = () => (
    <div className="wizard-stage">
      <div className="creation-mode-grid">
        {[
          ['excel', FileSpreadsheet, 'Excel 上傳', '下載模板後上傳，系統先預覽並標出列欄錯誤。'],
          ['manual', Pencil, '手動新增題目', '適合少量題目與精修題幹、解析、知識點。'],
          ['paste', UploadCloud, '複製貼上匯入', '支援以 | 或 tab 分隔題目與選項。'],
          ['batch', Rows3, '批量建立表單', '快速輸入多題，先驗證再儲存。']
        ].map(([value, Icon, title, text]) => (
          <button key={value} className={createMode === value ? 'active' : ''} onClick={() => setCreateMode(value)}>
            <Icon size={22} />
            <strong>{title}</strong>
            <span>{text}</span>
          </button>
        ))}
      </div>

      {createMode === 'excel' && (
        <>
          <div className="template-callout">
            <div>
              <strong>Excel 欄位建議</strong>
              <p>必填：題目、答案。選填：題型、選項A-D、難度、課程、章節、小節、知識點、教學目標、解析、來源備註。</p>
            </div>
            <a className="template-download" href={questionBankApi.templateUrl()}><Download size={16} /> 下載 Excel 模板</a>
          </div>
          <label className="excel-drop">
            <FileSpreadsheet size={26} />
            <span>選擇 Excel 檔案，上傳後先預覽，不會直接儲存</span>
            <input type="file" accept=".xlsx" onChange={previewFile} />
          </label>
        </>
      )}

      {createMode === 'manual' && (
        <div className="manual-editor">
          <select value={manualQuestion.type} onChange={(event) => updateManual('type', event.target.value)}>
            {QUESTION_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
          </select>
          <textarea placeholder="題目內容" value={manualQuestion.prompt} onChange={(event) => updateManual('prompt', event.target.value)} />
          <div className="option-grid">
            <input placeholder="選項 A" value={manualQuestion.optionA} onChange={(event) => updateManual('optionA', event.target.value)} />
            <input placeholder="選項 B" value={manualQuestion.optionB} onChange={(event) => updateManual('optionB', event.target.value)} />
            <input placeholder="選項 C" value={manualQuestion.optionC} onChange={(event) => updateManual('optionC', event.target.value)} />
            <input placeholder="選項 D" value={manualQuestion.optionD} onChange={(event) => updateManual('optionD', event.target.value)} />
          </div>
          <div className="option-grid">
            <input placeholder="答案，例如 A、B、O、X 或文字答案" value={manualQuestion.answer} onChange={(event) => updateManual('answer', event.target.value)} />
            <input placeholder="知識點" value={manualQuestion.knowledgePoint} onChange={(event) => updateManual('knowledgePoint', event.target.value)} />
            <input placeholder="教學目標" value={manualQuestion.teachingGoal} onChange={(event) => updateManual('teachingGoal', event.target.value)} />
            <input type="number" min="5" placeholder="預估秒數" value={manualQuestion.estimatedSolvingTime} onChange={(event) => updateManual('estimatedSolvingTime', Number(event.target.value))} />
          </div>
          <input placeholder="解析（選填）" value={manualQuestion.explanation} onChange={(event) => updateManual('explanation', event.target.value)} />
          <input placeholder="來源備註（選填）" value={manualQuestion.sourceNote} onChange={(event) => updateManual('sourceNote', event.target.value)} />
          <button className="primary-btn" disabled={busy || !manualQuestion.prompt.trim()} onClick={() => makePreview([manualQuestion])}><CheckCircle2 size={16} /> 產生預覽</button>
        </div>
      )}

      {createMode === 'paste' && (
        <div className="manual-editor">
          <textarea
            className="paste-box"
            value={pasteText}
            onChange={(event) => setPasteText(event.target.value)}
            placeholder={'每列一題：題目 | 選項A | 選項B | 選項C | 選項D | 答案\n例：太陽系中最大的行星是？ | 地球 | 木星 | 火星 | 金星 | B'}
          />
          <button className="primary-btn" disabled={busy || !pasteText.trim()} onClick={parsePaste}><UploadCloud size={16} /> 產生預覽</button>
        </div>
      )}

      {createMode === 'batch' && (
        <div className="manual-editor">
          <div className="batch-list">
            {batchQuestions.map((question, index) => (
              <div className="batch-row" key={index}>
                <input placeholder={`第 ${index + 1} 題`} value={question.prompt} onChange={(event) => setBatchQuestions(batchQuestions.map((item, itemIndex) => itemIndex === index ? { ...item, prompt: event.target.value } : item))} />
                <input placeholder="A" value={question.optionA} onChange={(event) => setBatchQuestions(batchQuestions.map((item, itemIndex) => itemIndex === index ? { ...item, optionA: event.target.value } : item))} />
                <input placeholder="B" value={question.optionB} onChange={(event) => setBatchQuestions(batchQuestions.map((item, itemIndex) => itemIndex === index ? { ...item, optionB: event.target.value } : item))} />
                <input placeholder="答案" value={question.answer} onChange={(event) => setBatchQuestions(batchQuestions.map((item, itemIndex) => itemIndex === index ? { ...item, answer: event.target.value } : item))} />
              </div>
            ))}
          </div>
          <div className="qb-inline-actions">
            <button onClick={() => setBatchQuestions([...batchQuestions, emptyQuestion()])}><Plus size={16} /> 增加一列</button>
            <button className="primary-btn" disabled={busy || !batchQuestions.some((question) => question.prompt.trim())} onClick={() => makePreview(batchQuestions)}><Rows3 size={16} /> 產生預覽</button>
          </div>
        </div>
      )}
    </div>
  );

  const renderWizard = () => (
    <div className="qb-workspace">
      <div className="phase-scope-banner">
        <strong>第一階段範圍</strong>
        <span>本階段聚焦：題庫上傳精靈、匯入預覽、權限模型、黑金介面一致性。AI 健康分析與學生弱點診斷會留到後續階段。</span>
      </div>
      <WizardStepper step={wizardStep} setStep={setWizardStep} preview={preview} />

      {wizardStep === 0 && renderSourceStep()}

      {wizardStep === 1 && (
        <div className="wizard-stage">
          <ImportValidationPanel preview={preview} />
          <EditablePreviewTable preview={preview} onChange={setPreview} />
          <div className="qb-inline-actions">
            <button onClick={revalidatePreview} disabled={!preview || busy}><AlertTriangle size={16} /> 重新驗證</button>
            <button className="primary-btn" disabled={!preview || preview.summary.invalidRows > 0} onClick={() => setWizardStep(2)}>下一步：補充資料</button>
          </div>
        </div>
      )}

      {wizardStep === 2 && (
        <div className="wizard-stage">
          <div className="metadata-heading">
            <Tags size={18} />
            <div>
              <strong>將題庫轉成教師知識資產</strong>
              <p>請補上科目、年級、課程、單元、知識點、標籤與使用情境，後續活動與分享會依這些欄位管理。</p>
            </div>
          </div>
          {renderMetadata()}
          <div className="qb-inline-actions">
            <button onClick={() => setWizardStep(1)}>返回預覽</button>
            <button className="primary-btn" disabled={!metadata.title.trim()} onClick={() => setWizardStep(3)}>下一步：權利確認</button>
          </div>
        </div>
      )}

      {wizardStep === 3 && (
        <div className="wizard-stage">
          <RightsNoticeBox />
          <div className="rights-confirm-panel">
            <h4>儲存前確認</h4>
            <p>平台會保留上傳、匯入與權利確認操作紀錄。權利提醒不是法律意見；若來源來自課本、付費教材、出版考題、校內講義或外部平台，請先確認授權。</p>
            <UploadAcknowledgementCheckbox checked={ack} onChange={setAck} />
          </div>
          <div className="qb-inline-actions">
            <button onClick={() => setWizardStep(2)}>返回補充資料</button>
            <button className="primary-btn" disabled={!preview || !ack || !metadata.title.trim() || preview.summary.invalidRows > 0 || busy} onClick={commitPreview}>
              <CheckCircle2 size={16} /> 確認並儲存
            </button>
          </div>
        </div>
      )}

      {wizardStep === 4 && (
        <div className="wizard-stage next-actions">
          <CheckCircle2 size={34} />
          <h4>題庫已儲存</h4>
          <p>{lastSavedBank?.title || metadata.title} 已成為可重複使用的教師知識資產。</p>
          <div className="next-action-grid">
            <button onClick={() => lastSavedBank && onSelectBank(lastSavedBank)}><BookOpen size={16} /> 建立即時測驗</button>
            <button onClick={() => lastSavedBank && setShareBank(lastSavedBank)}><Share2 size={16} /> 分享給其他老師</button>
            <button onClick={resetWizard}><Plus size={16} /> 建立下一個題庫</button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <section className="question-bank-dashboard">
      <div className="qb-header">
        <div>
          <h3>教師題庫管理</h3>
          <p>上傳、預覽、整理、分享與重複使用題庫；權限由後端 API 驗證。</p>
        </div>
        <div className="qb-view-switch">
          <button className={view === 'library' ? 'active' : ''} onClick={() => setView('library')}><BookOpen size={16} /> 題庫資產庫</button>
          <button className={view === 'wizard' ? 'active' : ''} onClick={() => setView('wizard')}><UploadCloud size={16} /> 上傳精靈</button>
        </div>
      </div>

      <RightsNoticeBox />

      {view === 'library' && (
        <>
          <div className="teacher-library-toolbar">
            <div className="toolbar-search">
              <Search size={16} />
              <input placeholder="搜尋題庫、科目、課程、標籤" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} />
            </div>
            <select value={filters.ownership} onChange={(event) => setFilters({ ...filters, ownership: event.target.value })}>
              <option value="all">全部權限</option>
              <option value="owned">我擁有</option>
              <option value="shared">分享給我</option>
            </select>
            <select value={filters.subject} onChange={(event) => setFilters({ ...filters, subject: event.target.value })}>
              <option value="">全部科目</option>
              {subjects.map((subject) => <option key={subject} value={subject}>{subject}</option>)}
            </select>
            <select value={filters.difficulty} onChange={(event) => setFilters({ ...filters, difficulty: event.target.value })}>
              <option value="">全部難度</option>
              <option value="easy">簡單</option>
              <option value="medium">中等</option>
              <option value="hard">困難</option>
            </select>
          </div>

          <div className="qb-library">
            <div className="library-column">
              <h4><KeyRound size={18} /> 我擁有的題庫</h4>
              {ownedBanks.length === 0 && <p className="empty-text">尚未建立題庫。</p>}
              {ownedBanks.map((bank) => (
                <QuestionBankCard key={bank.id} bank={bank} selected={bank.id === selectedBankId} onSelect={onSelectBank} onDelete={onDeleteBank} onShare={setShareBank} onCopy={copyBank} onExport={setExportBank} onCreateActivity={setActivityBank} />
              ))}
            </div>
            <div className="library-column">
              <h4><Users size={18} /> 分享給我的題庫</h4>
              {sharedBanks.length === 0 && <p className="empty-text">目前沒有老師分享題庫給你。</p>}
              {sharedBanks.map((bank) => (
                <QuestionBankCard key={bank.id} bank={bank} selected={bank.id === selectedBankId} onSelect={onSelectBank} onDelete={onDeleteBank} onShare={setShareBank} onCopy={copyBank} onExport={setExportBank} onCreateActivity={setActivityBank} />
              ))}
            </div>
          </div>
        </>
      )}

      {view === 'wizard' && renderWizard()}

      {selectedBank && (
        <div className="selected-bank-panel">
          <div>
            <h4>{selectedBank.title || selectedBank.name}</h4>
            <p>{selectedBank.permission?.notice}</p>
          </div>
          <AuditPanel user={user} bank={selectedBank} />
          <AIHealthReportPanel user={user} bank={selectedBank} />
          <AIAssistantPanel user={user} bank={selectedBank} onApplied={onReload} />
          <QuestionBankVersionHistory user={user} bank={selectedBank} />
          <ClassWeaknessReportPanel user={user} bank={selectedBank} />
          <div className="next-action-grid">
            <button disabled={!selectedBank.permission?.canUse} title={!selectedBank.permission?.canUse ? '你沒有使用此題庫的權限。' : '建立課堂活動'} onClick={() => setActivityBank(selectedBank)}>
              <PlayCircle size={16} /> 用此題庫產生活動
            </button>
          </div>
          <div className="selected-question-list">
            {(selectedBank.questions || []).slice(0, 12).map((question, index) => (
              <div key={question.id || index}>
                <span>{index + 1}</span>
                <p>{question.prompt || question.Question}</p>
                <button disabled={!selectedBank.permission?.canEdit} title={!selectedBank.permission?.canEdit ? '只有擁有者可以編輯或刪除原始題目。' : '軟刪除此題'} onClick={() => onDeleteQuestion(question.id, index)}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="qb-security-footnote">
        <Lock size={16} />
        前端按鈕只用來提示可用操作；建立、讀取、更新、刪除、分享、匯出、複製與調度都會再次經過後端角色與所有權驗證。
      </div>

      <div className="phase-one-security-note">
        <SlidersHorizontal size={16} />
        Phase 5 已加入即時課堂作答回流、題目成效統計與班級弱點報告基礎；完整個人錯題本會在後續階段接上。
      </div>

      {shareBank && <ShareModal user={user} bank={shareBank} onClose={() => setShareBank(null)} onDone={onReload} />}
      {exportBank && <ExportModal user={user} bank={exportBank} onClose={() => setExportBank(null)} />}
      {activityBank && <ActivityGeneratorModal user={user} bank={activityBank} onClose={() => setActivityBank(null)} onGenerated={onActivityGenerated} />}
    </section>
  );
}
