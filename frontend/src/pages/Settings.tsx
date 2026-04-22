import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Plus, Pencil, Trash2, Check, X,
  Sun, Moon, Monitor, Loader2,
} from 'lucide-react';
import Modal from '../components/common/Modal';
import Toast from '../components/common/Toast';
import TagInput from '../components/common/TagInput';
import { listTemplates } from '../api/templates';
import { listParticipants, listLocations, addParticipant, addLocation } from '../api/contacts';
import { testConnection, listChannels } from '../api/slack';
import api from '../api/client';
import { getTheme, setTheme as applyThemeChoice } from '../utils/theme';
import type { Theme } from '../utils/theme';
import type { Template } from '../types';
import type { Contact } from '../api/contacts';
import type { SlackChannel } from '../api/slack';

interface AppSettings {
  slack: { bot_token: string; connected: boolean };
  claude: { api_key: string; summary_model: string; tagging_model: string };
  whisper: { model: string };
  slack_greeting: string;
  export_path: string;
}

export default function Settings() {
  const navigate = useNavigate();

  // Theme
  const [currentTheme, setCurrentTheme] = useState<Theme>(getTheme());

  // Settings
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);

  // Inline editing
  const [editingApiKey, setEditingApiKey] = useState(false);
  const [newApiKey, setNewApiKey] = useState('');
  const [editingSlackToken, setEditingSlackToken] = useState(false);
  const [newSlackToken, setNewSlackToken] = useState('');
  const [whisperModel, setWhisperModel] = useState('medium');
  const [deleteTemplateId, setDeleteTemplateId] = useState<string | null>(null);

  // Templates
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateModal, setTemplateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [tplName, setTplName] = useState('');
  const [tplTitle, setTplTitle] = useState('');
  const [tplParticipants, setTplParticipants] = useState<string[]>([]);
  const [tplLocation, setTplLocation] = useState('');
  const [tplLanguage, setTplLanguage] = useState('ko-KR');
  const [tplSlackChannel, setTplSlackChannel] = useState('');
  const [tplChannels, setTplChannels] = useState<SlackChannel[]>([]);

  // Contacts
  const [participants, setParticipants] = useState<Contact[]>([]);
  const [locations, setLocations] = useState<Contact[]>([]);
  const [newParticipant, setNewParticipant] = useState('');
  const [newLocation, setNewLocation] = useState('');

  // Slack test
  const [slackTesting, setSlackTesting] = useState(false);
  const [slackTestResult, setSlackTestResult] = useState<string | null>(null);

  // Editing fields
  const [greeting, setGreeting] = useState('');

  const [toast, setToast] = useState({ message: '', visible: false });
  const showToast = (msg: string) => setToast({ message: msg, visible: true });

  useEffect(() => {
    Promise.all([
      api.get('/settings').then((r) => r.data),
      listTemplates(),
      listParticipants(),
      listLocations(),
    ]).then(([s, t, p, l]) => {
      setSettings(s);
      setGreeting(s.slack_greeting || '');
      setWhisperModel(s.whisper?.model || 'medium');
      setTemplates(t);
      setParticipants(p);
      setLocations(l);
    }).catch(() => {})
    .finally(() => setSettingsLoading(false));
  }, []);

  const handleThemeChange = (theme: Theme) => {
    setCurrentTheme(theme);
    applyThemeChoice(theme);
  };

  const maskToken = (token: string) => {
    if (!token) return '미설정';
    // 백엔드가 이미 마스킹한 경우 (● 문자 포함) 그대로 표시
    if (token.includes('\u25CF') || token.includes('...')) return token;
    if (token.length < 8) return '미설정';
    return token.slice(0, 6) + '\u25CF'.repeat(Math.max(token.length - 10, 4)) + token.slice(-4);
  };

  const handleSaveGreeting = async () => {
    try {
      await api.patch('/settings', { slack_greeting: greeting });
      showToast('인사 문구 저장됨');
    } catch {}
  };

  const handleSaveApiKey = async () => {
    try {
      const res = await api.patch('/settings', { claude: { api_key: newApiKey } });
      setSettings(res.data);
      setEditingApiKey(false);
      setNewApiKey('');
      showToast('API 키 저장됨');
    } catch { showToast('저장 실패'); }
  };

  const handleSaveSlackToken = async () => {
    try {
      const res = await api.patch('/settings', { slack: { bot_token: newSlackToken } });
      setSettings(res.data);
      setEditingSlackToken(false);
      setNewSlackToken('');
      showToast('Slack 토큰 저장됨');
    } catch { showToast('저장 실패'); }
  };

  const handleSaveWhisperModel = async (model: string) => {
    setWhisperModel(model);
    try {
      await api.patch('/settings', { whisper: { model } });
      showToast(`Whisper 모델: ${model}`);
    } catch { showToast('저장 실패'); }
  };

  const handleSlackTest = async () => {
    setSlackTesting(true);
    try {
      const result = await testConnection();
      setSlackTestResult(result.ok ? `연결 성공: ${result.bot_name}` : `연결 실패: ${result.error}`);
    } catch {
      setSlackTestResult('연결 테스트 실패');
    }
    setSlackTesting(false);
  };

  // Template CRUD
  const openTemplateModal = (tpl?: Template) => {
    if (tpl) {
      setEditingTemplate(tpl);
      setTplName(tpl.name);
      setTplTitle(tpl.defaults.title);
      setTplParticipants(tpl.defaults.participants);
      setTplLocation(tpl.defaults.location || '');
      setTplLanguage(tpl.defaults.language);
      setTplSlackChannel(tpl.defaults.slack_channel_id || '');
    } else {
      setEditingTemplate(null);
      setTplName('');
      setTplTitle('');
      setTplParticipants([]);
      setTplLocation('');
      setTplLanguage('ko-KR');
      setTplSlackChannel('');
    }
    setTemplateModal(true);
    listChannels().then(setTplChannels).catch(() => {});
  };

  const handleSaveTemplate = async () => {
    const body = {
      name: tplName,
      defaults: {
        title: tplTitle,
        participants: tplParticipants,
        location: tplLocation || null,
        language: tplLanguage,
        slack_channel_id: tplSlackChannel || null,
      },
    };
    try {
      if (editingTemplate) {
        await api.patch(`/templates/${editingTemplate.template_id}`, body);
      } else {
        await api.post('/templates', body);
      }
      const updated = await listTemplates();
      setTemplates(updated);
      setTemplateModal(false);
      showToast(editingTemplate ? '템플릿 수정됨' : '템플릿 생성됨');
    } catch { showToast('저장 실패'); }
  };

  const handleDeleteTemplate = async (id: string) => {
    try {
      await api.delete(`/templates/${id}`);
      setTemplates(templates.filter((t) => t.template_id !== id));
      showToast('템플릿 삭제됨');
    } catch {}
  };

  // Contacts
  const handleAddParticipant = async () => {
    if (!newParticipant.trim()) return;
    try {
      await addParticipant(newParticipant.trim());
      setParticipants(await listParticipants());
      setNewParticipant('');
    } catch {}
  };

  const handleAddLocation = async () => {
    if (!newLocation.trim()) return;
    try {
      await addLocation(newLocation.trim());
      setLocations(await listLocations());
      setNewLocation('');
    } catch {}
  };

  const handleDeleteContact = async (type: 'participants' | 'locations', id: string) => {
    try {
      await api.delete(`/contacts/${type}/${id}`);
      if (type === 'participants') setParticipants(await listParticipants());
      else setLocations(await listLocations());
    } catch {}
  };

  if (settingsLoading) {
    return (
      <div className="max-w-3xl mx-auto min-h-screen px-6 md:px-10 pt-20">
        <p className="text-sm text-text-tertiary text-center py-8">로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto min-h-screen px-6 md:px-10 pt-20 pb-12">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <button
          onClick={() => navigate('/')}
          className="text-text-secondary hover:text-text transition-colors cursor-pointer"
        >
          <ArrowLeft size={20} />
        </button>
      </div>
      <h1 className="text-[40px] font-bold leading-tight text-text">설정</h1>

      {/* Theme */}
      <section className="mt-20">
        <h2 className="text-[28px] font-bold text-text mb-6">외관</h2>
        <div className="flex gap-1 bg-bg-subtle rounded-lg p-1">
          {([
            { value: 'system' as Theme, icon: Monitor, label: '시스템' },
            { value: 'light' as Theme, icon: Sun, label: '라이트' },
            { value: 'dark' as Theme, icon: Moon, label: '다크' },
          ]).map(({ value, icon: Icon, label }) => (
            <button
              key={value}
              onClick={() => handleThemeChange(value)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-md transition-colors cursor-pointer ${
                currentTheme === value
                  ? 'bg-bg text-text shadow-sm'
                  : 'text-text-secondary hover:text-text'
              }`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>
      </section>

      {/* Templates */}
      <section className="mt-20">
        <h2 className="text-[28px] font-bold text-text mb-6">회의 템플릿</h2>
        <div className="space-y-2">
          {templates.map((tpl) => (
            <div key={tpl.template_id} className="flex items-center justify-between bg-bg-subtle rounded-xl p-4">
              <span className="text-[15px] text-text font-medium">{tpl.name}</span>
              <div className="flex gap-2">
                <button onClick={() => openTemplateModal(tpl)} className="p-1.5 text-text-tertiary hover:text-text cursor-pointer">
                  <Pencil size={14} />
                </button>
                <button onClick={() => setDeleteTemplateId(tpl.template_id)} className="p-1.5 text-text-tertiary hover:text-recording cursor-pointer">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
          <button
            onClick={() => openTemplateModal()}
            className="flex items-center gap-1.5 px-4 py-3 text-sm font-medium text-text-secondary hover:text-text cursor-pointer"
          >
            <Plus size={14} />
            새 템플릿
          </button>
        </div>
      </section>

      {/* Contacts */}
      <section className="mt-20">
        <h2 className="text-[28px] font-bold text-text mb-6">주소록</h2>
        <h3 className="text-xl font-semibold text-text mb-3">참여자</h3>
        <div className="space-y-1 mb-3">
          {participants.map((p) => (
            <div key={p.id} className="flex items-center justify-between py-1.5 px-3">
              <span className="text-sm text-text">{p.name}</span>
              <button onClick={() => handleDeleteContact('participants', p.id)} className="text-text-tertiary hover:text-recording cursor-pointer"><X size={14} /></button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={newParticipant} onChange={(e) => setNewParticipant(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddParticipant()} placeholder="참여자 추가"
            className="flex-1 bg-bg-subtle rounded-lg px-4 py-2 text-sm focus:bg-bg focus:ring-2 focus:ring-primary focus:outline-none" />
          <button onClick={handleAddParticipant} className="px-3 py-2 text-sm font-medium text-bg bg-primary rounded-lg hover:bg-primary-hover cursor-pointer">추가</button>
        </div>

        <h3 className="text-xl font-semibold text-text mb-3 mt-8">장소</h3>
        <div className="space-y-1 mb-3">
          {locations.map((l) => (
            <div key={l.id} className="flex items-center justify-between py-1.5 px-3">
              <span className="text-sm text-text">{l.name}</span>
              <button onClick={() => handleDeleteContact('locations', l.id)} className="text-text-tertiary hover:text-recording cursor-pointer"><X size={14} /></button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={newLocation} onChange={(e) => setNewLocation(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddLocation()} placeholder="장소 추가"
            className="flex-1 bg-bg-subtle rounded-lg px-4 py-2 text-sm focus:bg-bg focus:ring-2 focus:ring-primary focus:outline-none" />
          <button onClick={handleAddLocation} className="px-3 py-2 text-sm font-medium text-bg bg-primary rounded-lg hover:bg-primary-hover cursor-pointer">추가</button>
        </div>
      </section>

      {/* Integrations */}
      <section className="mt-20">
        <h2 className="text-[28px] font-bold text-text mb-6">연동</h2>
        <div className="space-y-4">
          <div className="bg-bg-subtle rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[15px] font-medium text-text">Slack</p>
                <p className="text-xs text-text-tertiary mt-0.5">{maskToken(settings?.slack?.bot_token || '')}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setEditingSlackToken(!editingSlackToken)} className="text-sm text-text-secondary hover:text-text cursor-pointer">변경</button>
                <button onClick={handleSlackTest} disabled={slackTesting}
                  className="px-3 py-1.5 text-sm font-medium text-text bg-bg rounded-lg hover:bg-bg-hover cursor-pointer disabled:opacity-50">
                  {slackTesting ? <Loader2 size={14} className="animate-spin" /> : '연결 테스트'}
                </button>
              </div>
            </div>
            {editingSlackToken && (
              <div className="mt-3 flex gap-2">
                <input type="password" placeholder="새 Bot Token" value={newSlackToken} onChange={(e) => setNewSlackToken(e.target.value)}
                  className="flex-1 bg-bg rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none" />
                <button onClick={handleSaveSlackToken} className="px-3 py-2 text-sm font-medium text-bg bg-primary rounded-lg hover:bg-primary-hover cursor-pointer">저장</button>
              </div>
            )}
            {slackTestResult && (
              <p className={`text-xs mt-2 ${slackTestResult.includes('성공') ? 'text-success' : 'text-recording'}`}>{slackTestResult}</p>
            )}
          </div>

          <div className="bg-bg-subtle rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[15px] font-medium text-text">Claude API</p>
                <p className="text-xs text-text-tertiary mt-0.5">{maskToken(settings?.claude?.api_key || '')}</p>
              </div>
              <button onClick={() => setEditingApiKey(!editingApiKey)} className="text-sm text-text-secondary hover:text-text cursor-pointer">변경</button>
            </div>
            {editingApiKey && (
              <div className="mt-3 flex gap-2">
                <input type="password" placeholder="새 API 키" value={newApiKey} onChange={(e) => setNewApiKey(e.target.value)}
                  className="flex-1 bg-bg rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none" />
                <button onClick={handleSaveApiKey} className="px-3 py-2 text-sm font-medium text-bg bg-primary rounded-lg hover:bg-primary-hover cursor-pointer">저장</button>
              </div>
            )}
          </div>

          <div className="bg-bg-subtle rounded-xl p-4">
            <p className="text-[15px] font-medium text-text">Whisper 모델</p>
            <select value={whisperModel} onChange={(e) => handleSaveWhisperModel(e.target.value)}
              className="mt-2 w-full bg-bg rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none cursor-pointer">
              <option value="tiny">tiny (~1분, 낮음)</option>
              <option value="base">base (~2분, 보통)</option>
              <option value="small">small (~3분, 양호)</option>
              <option value="medium">medium (~5-8분, 높음) — 추천</option>
              <option value="large">large (~15분+, 최고)</option>
            </select>
          </div>
        </div>
      </section>

      {/* Message */}
      <section className="mt-20">
        <h2 className="text-[28px] font-bold text-text mb-6">메시지</h2>
        <label className="text-xs font-medium text-text-secondary block mb-1">Slack 인사 문구</label>
        <div className="space-y-2">
          <textarea value={greeting} onChange={(e) => setGreeting(e.target.value)}
            rows={3}
            className="w-full bg-bg-subtle rounded-lg px-4 py-3 text-[15px] focus:bg-bg focus:ring-2 focus:ring-primary focus:outline-none resize-y min-h-[80px]"
            placeholder="줄바꿈, 이모티콘 사용 가능" />
          <div className="flex justify-end">
            <button onClick={handleSaveGreeting}
              className="px-4 py-2 text-sm font-medium text-bg bg-primary rounded-lg hover:bg-primary-hover cursor-pointer">
              저장
            </button>
          </div>
        </div>
      </section>

      {/* Template Modal */}
      <Modal open={templateModal} onClose={() => setTemplateModal(false)}>
        <h3 className="text-lg font-semibold text-text mb-4">
          {editingTemplate ? '템플릿 편집' : '새 템플릿'}
        </h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-text-secondary block mb-1">템플릿 이름</label>
            <input value={tplName} onChange={(e) => setTplName(e.target.value)}
              className="w-full bg-bg-subtle rounded-lg px-4 py-2 text-sm focus:bg-bg focus:ring-2 focus:ring-primary focus:outline-none" />
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary block mb-1">제목 (기본값)</label>
            <input value={tplTitle} onChange={(e) => setTplTitle(e.target.value)}
              className="w-full bg-bg-subtle rounded-lg px-4 py-2 text-sm focus:bg-bg focus:ring-2 focus:ring-primary focus:outline-none" />
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary block mb-1">참여자</label>
            <TagInput values={tplParticipants} onChange={setTplParticipants}
              suggestions={participants.map((p) => p.name)} placeholder="참여자" />
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary block mb-1">장소</label>
            <input value={tplLocation} onChange={(e) => setTplLocation(e.target.value)}
              className="w-full bg-bg-subtle rounded-lg px-4 py-2 text-sm focus:bg-bg focus:ring-2 focus:ring-primary focus:outline-none" />
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary block mb-1">언어</label>
            <select value={tplLanguage} onChange={(e) => setTplLanguage(e.target.value)}
              className="w-full bg-bg-subtle rounded-lg px-4 py-2 text-sm focus:bg-bg focus:ring-2 focus:ring-primary focus:outline-none cursor-pointer">
              <option value="ko-KR">한국어</option>
              <option value="en-US">English</option>
              <option value="ja-JP">日本語</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary block mb-1">Slack 채널</label>
            <select value={tplSlackChannel} onChange={(e) => setTplSlackChannel(e.target.value)}
              className="w-full bg-bg-subtle rounded-lg px-4 py-2 text-sm focus:bg-bg focus:ring-2 focus:ring-primary focus:outline-none cursor-pointer">
              <option value="">선택 안 함</option>
              {tplChannels.map((ch) => <option key={ch.id} value={ch.id}>#{ch.name}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-2 justify-end mt-6">
          <button onClick={() => setTemplateModal(false)}
            className="px-4 py-2 text-sm font-medium text-text bg-bg-subtle rounded-lg hover:bg-bg-hover cursor-pointer">취소</button>
          <button onClick={handleSaveTemplate} disabled={!tplName.trim()}
            className="px-4 py-2 text-sm font-medium text-bg bg-primary rounded-lg hover:bg-primary-hover cursor-pointer disabled:opacity-30">저장</button>
        </div>
      </Modal>

      {/* Delete template confirm */}
      <Modal open={!!deleteTemplateId} onClose={() => setDeleteTemplateId(null)}>
        <h3 className="text-lg font-semibold text-text mb-2">템플릿 삭제</h3>
        <p className="text-sm text-text-secondary mb-6">이 템플릿을 삭제할까요?</p>
        <div className="flex gap-2 justify-end">
          <button onClick={() => setDeleteTemplateId(null)}
            className="px-4 py-2 text-sm font-medium text-text bg-bg-subtle rounded-lg hover:bg-bg-hover cursor-pointer">취소</button>
          <button onClick={() => { if (deleteTemplateId) handleDeleteTemplate(deleteTemplateId); setDeleteTemplateId(null); }}
            className="px-4 py-2 text-sm font-medium text-bg bg-recording rounded-lg hover:opacity-90 cursor-pointer">삭제</button>
        </div>
      </Modal>

      <Toast message={toast.message} visible={toast.visible} onHide={() => setToast((prev) => ({ ...prev, visible: false }))} />
    </div>
  );
}
