import React, { useMemo, useState } from 'react';
import { AlertTriangle, FileText, Lock, RotateCcw, Search, ShieldAlert, Unlock } from 'lucide-react';
import { questionBankApi } from '../questionBankApi';

const ADMIN_STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'rights-review-needed', label: 'Rights review' },
  { value: 'locked', label: 'Locked' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'deleted', label: 'Deleted' }
];

function isAdminUser(user) {
  const role = String(user?.role || user?.customClaims?.role || '').toLowerCase();
  return ['admin', 'developer', 'owner', 'platform_admin', 'superadmin'].includes(role);
}

export default function AdminQuestionBankControlPanel({ user }) {
  const [banks, setBanks] = useState([]);
  const [logs, setLogs] = useState([]);
  const [query, setQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [reason, setReason] = useState('Platform compliance review');
  const [loading, setLoading] = useState(false);
  const [accessError, setAccessError] = useState('');

  const canUseAdmin = isAdminUser(user);

  const filteredBanks = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return banks.filter((bank) => {
      const matchesQuery = !needle || [
        bank.title,
        bank.ownerTeacherId,
        bank.ownerTeacherName,
        bank.subject,
        bank.status
      ].filter(Boolean).join(' ').toLowerCase().includes(needle);
      const matchesStatus = selectedStatus === 'all' || bank.status === selectedStatus;
      return matchesQuery && matchesStatus;
    });
  }, [banks, query, selectedStatus]);

  const loadAdminData = async () => {
    setLoading(true);
    try {
      setAccessError('');
      const [bankResult, auditResult] = await Promise.all([
        questionBankApi.adminBanks(user),
        questionBankApi.adminAudit(user)
      ]);
      setBanks(bankResult);
      setLogs(auditResult);
    } catch (error) {
      setAccessError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (bank, status) => {
    if (!reason.trim()) {
      alert('請填寫管理原因或合規備註。');
      return;
    }
    setLoading(true);
    try {
      const updated = await questionBankApi.adminUpdateBankStatus(user, bank.id, {
        status,
        reason,
        note: `Admin governance action from control panel: ${status}`
      });
      setBanks((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      const auditResult = await questionBankApi.adminAudit(user);
      setLogs(auditResult);
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  const restoreBank = async (bank) => {
    if (!reason.trim()) {
      alert('請填寫復原原因。');
      return;
    }
    setLoading(true);
    try {
      const updated = await questionBankApi.restoreBank(user, bank.id, reason);
      setBanks((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      const auditResult = await questionBankApi.adminAudit(user);
      setLogs(auditResult);
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  if (!canUseAdmin) return null;

  return (
    <section className="admin-qb-panel">
      <div className="admin-qb-header">
        <div>
          <h3><ShieldAlert size={22} /> 平台題庫治理控制台</h3>
          <p>僅限平台管理、合規、維護與權利爭議處理使用。一般老師不會看到此區塊，所有操作仍由後端角色檢查保護。</p>
        </div>
        <button className="primary-btn" onClick={loadAdminData} disabled={loading}>
          {loading ? '讀取中...' : '載入治理資料'}
        </button>
      </div>

      <div className="admin-governance-notice">
        <AlertTriangle size={18} />
        <span>管理操作應基於安全、濫用防範、權利保護、法律合規、爭議處理、資料復原或平台營運必要性，並保留 audit log。</span>
      </div>

      {accessError && (
        <div className="admin-access-warning">
          <Lock size={18} />
          <span>{accessError} 後端已啟用 server-side admin allowlist；請確認 Render 環境變數 `ADMIN_USER_IDS` 或 `ADMIN_EMAILS` 已設定。</span>
        </div>
      )}

      <div className="admin-toolbar">
        <label className="toolbar-search">
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋題庫、老師、科目或狀態" />
        </label>
        <select value={selectedStatus} onChange={(event) => setSelectedStatus(event.target.value)}>
          <option value="all">全部狀態</option>
          {ADMIN_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
        </select>
        <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="管理原因 / 合規備註" />
      </div>

      <div className="admin-bank-grid">
        {filteredBanks.map((bank) => (
          <article key={bank.id} className="admin-bank-card">
            <div>
              <span className={`bank-status ${bank.status}`}>{bank.status}</span>
              <h4>{bank.title || bank.name}</h4>
              <p>{bank.subject || '未設定科目'} · {bank.questions?.length || 0} 題 · owner: {bank.ownerTeacherName || bank.ownerTeacherId}</p>
              <small>Rights: {bank.rightsRiskStatus || 'unchecked'} · Visibility: {bank.visibility}</small>
            </div>
            <div className="admin-action-row">
              <button onClick={() => updateStatus(bank, 'rights-review-needed')}><FileText size={15} /> 權利審查</button>
              <button onClick={() => updateStatus(bank, 'locked')}><Lock size={15} /> 鎖定</button>
              <button onClick={() => updateStatus(bank, 'suspended')}><ShieldAlert size={15} /> 暫停</button>
              <button onClick={() => updateStatus(bank, 'active')}><Unlock size={15} /> 啟用</button>
              <button onClick={() => updateStatus(bank, 'deleted')}><RotateCcw size={15} /> 軟刪除</button>
              <button onClick={() => restoreBank(bank)} disabled={bank.status !== 'deleted' && !bank.deletedAt}><RotateCcw size={15} /> 復原</button>
            </div>
          </article>
        ))}
        {!filteredBanks.length && <p className="empty-text">尚未載入資料，或沒有符合條件的題庫。</p>}
      </div>

      <div className="admin-audit-panel">
        <h4>最近 Audit Logs</h4>
        <div className="admin-audit-list">
          {logs.slice(0, 12).map((log) => (
            <div key={log.id}>
              <strong>{log.actionType}</strong>
              <span>{log.actorRole} / {log.actorUserId}</span>
              <small>{new Date(log.createdAt).toLocaleString()}</small>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
