import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, Upload, FileAudio } from 'lucide-react';
import WizardLayout from '../components/wizard/WizardLayout';
import TagInput from '../components/common/TagInput';
import Toast from '../components/common/Toast';
import { useWizardStore } from '../stores/wizardStore';
import { useSessionStore } from '../stores/sessionStore';
import { listTemplates } from '../api/templates';
import { listParticipants, listLocations, addParticipant, addLocation } from '../api/contacts';
import { createSession } from '../api/sessions';
import type { Template, InputMode } from '../types';
import type { Contact } from '../api/contacts';

const LANGUAGES = [
  { value: 'ko-KR', label: '한국어' },
  { value: 'en-US', label: 'English' },
  { value: 'ja-JP', label: '日本語' },
  { value: 'zh-CN', label: '中文' },
];

export default function MeetingSetup() {
  const navigate = useNavigate();
  const { setStep, setInputMode, inputMode } = useWizardStore();
  const setSession = useSessionStore((s) => s.setSession);

  // Form state
  const [title, setTitle] = useState('');
  const [participants, setParticipants] = useState<string[]>([]);
  const [location, setLocation] = useState('');
  const [language, setLanguage] = useState('ko-KR');
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  // Template-filled tracking
  const [filledFields, setFilledFields] = useState<Set<string>>(new Set());

  // Data
  const [templates, setTemplates] = useState<Template[]>([]);
  const [contactParticipants, setContactParticipants] = useState<Contact[]>([]);
  const [contactLocations, setContactLocations] = useState<Contact[]>([]);

  // Toast
  const [toast, setToast] = useState({ message: '', visible: false });

  // Loading
  const [creating, setCreating] = useState(false);

  const titleRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setStep(2);
    listTemplates().then(setTemplates).catch(() => {});
    listParticipants().then(setContactParticipants).catch(() => {});
    listLocations().then(setContactLocations).catch(() => {});
  }, [setStep]);

  // Template selection
  const handleTemplateSelect = useCallback(
    (tplId: string) => {
      const tpl = templates.find((t) => t.template_id === tplId);
      if (!tpl) {
        setTemplateId(null);
        setFilledFields(new Set());
        return;
      }

      setTemplateId(tplId);
      const filled = new Set<string>();

      if (tpl.defaults.title) {
        setTitle(tpl.defaults.title);
        filled.add('title');
      }
      if (tpl.defaults.participants.length > 0) {
        setParticipants(tpl.defaults.participants);
        filled.add('participants');
      }
      if (tpl.defaults.location) {
        setLocation(tpl.defaults.location);
        filled.add('location');
      }
      if (tpl.defaults.language) {
        setLanguage(tpl.defaults.language);
      }

      setFilledFields(filled);
      setToast({
        message: `'${tpl.name}' 기본값을 불러왔습니다. 수정해도 템플릿은 변경되지 않습니다.`,
        visible: true,
      });

      setTimeout(() => titleRef.current?.focus(), 100);
    },
    [templates]
  );

  // Field change clears highlight
  const handleTitleChange = (v: string) => {
    setTitle(v);
    setFilledFields((prev) => {
      const next = new Set(prev);
      next.delete('title');
      return next;
    });
  };

  const handleParticipantsChange = (v: string[]) => {
    setParticipants(v);
    // Auto-add new participants to address book
    v.forEach((name) => {
      if (!contactParticipants.find((c) => c.name === name)) {
        addParticipant(name).then((c) =>
          setContactParticipants((prev) => [...prev, c])
        ).catch(() => {});
      }
    });
    setFilledFields((prev) => {
      const next = new Set(prev);
      next.delete('participants');
      return next;
    });
  };

  const handleLocationChange = (v: string) => {
    setLocation(v);
    setFilledFields((prev) => {
      const next = new Set(prev);
      next.delete('location');
      return next;
    });
  };

  // File upload
  const handleFileSelect = (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['webm', 'mp3', 'wav', 'm4a'].includes(ext || '')) {
      setToast({ message: '지원하지 않는 파일 형식입니다 (.webm .mp3 .wav .m4a)', visible: true });
      return;
    }
    setUploadedFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  // Submit
  const handleNext = async () => {
    if (!title.trim()) {
      setToast({ message: '회의 제목을 입력해주세요', visible: true });
      titleRef.current?.focus();
      return;
    }

    if (inputMode === 'upload' && !uploadedFile) {
      setToast({ message: '오디오 파일을 선택해주세요', visible: true });
      return;
    }

    setCreating(true);
    try {
      const session = await createSession(inputMode, {
        title: title.trim(),
        participants,
        location: location.trim() || null,
        language,
        template_id: templateId,
      });
      setSession(session);

      if (inputMode === 'upload') {
        // TODO: upload file to server, then navigate to processing
        navigate('/processing');
      } else {
        navigate('/recording');
      }
    } catch (err: any) {
      const detail = err?.response?.data?.detail || '세션 생성에 실패했습니다';
      setToast({ message: detail, visible: true });
    } finally {
      setCreating(false);
    }
  };

  return (
    <WizardLayout>
      <div className="max-w-lg mx-auto">
        {/* 템플릿 선택 */}
        <div className="mb-5">
          <label className="block text-xs font-medium text-text-secondary mb-1.5">
            템플릿
          </label>
          <select
            value={templateId || ''}
            onChange={(e) =>
              e.target.value
                ? handleTemplateSelect(e.target.value)
                : (setTemplateId(null), setFilledFields(new Set()))
            }
            className="w-full px-3 py-2 border border-border rounded-lg text-sm text-text bg-bg focus:border-primary focus:outline-none cursor-pointer"
          >
            <option value="">선택 안 함</option>
            {templates.map((t) => (
              <option key={t.template_id} value={t.template_id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        {/* 제목 */}
        <div className="mb-5">
          <label className="block text-xs font-medium text-text-secondary mb-1.5">
            제목 <span className="text-recording">*</span>
          </label>
          <input
            ref={titleRef}
            type="text"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="회의 제목을 입력하세요"
            className={`w-full px-3 py-2 border rounded-lg text-sm focus:border-primary focus:outline-none transition-colors ${
              filledFields.has('title')
                ? 'bg-template border-primary/30'
                : 'border-border'
            }`}
          />
        </div>

        {/* 참여자 */}
        <div className="mb-5">
          <label className="block text-xs font-medium text-text-secondary mb-1.5">
            참여자
          </label>
          <TagInput
            values={participants}
            onChange={handleParticipantsChange}
            suggestions={contactParticipants.map((c) => c.name)}
            placeholder="이름을 입력하고 Enter"
            highlighted={filledFields.has('participants')}
          />
        </div>

        {/* 장소 */}
        <div className="mb-5">
          <label className="block text-xs font-medium text-text-secondary mb-1.5">
            장소
          </label>
          <input
            type="text"
            value={location}
            onChange={(e) => handleLocationChange(e.target.value)}
            placeholder="회의 장소"
            list="location-suggestions"
            className={`w-full px-3 py-2 border rounded-lg text-sm focus:border-primary focus:outline-none transition-colors ${
              filledFields.has('location')
                ? 'bg-template border-primary/30'
                : 'border-border'
            }`}
          />
          <datalist id="location-suggestions">
            {contactLocations.map((l) => (
              <option key={l.id} value={l.name} />
            ))}
          </datalist>
        </div>

        {/* 언어 */}
        <div className="mb-8">
          <label className="block text-xs font-medium text-text-secondary mb-1.5">
            언어
          </label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full px-3 py-2 border border-border rounded-lg text-sm text-text bg-bg focus:border-primary focus:outline-none cursor-pointer"
          >
            {LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </div>

        {/* 구분선 */}
        <div className="border-t border-border mb-6" />

        {/* 입력 소스 선택 */}
        <div className="mb-6">
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => {
                setInputMode('realtime');
                setUploadedFile(null);
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
                inputMode === 'realtime'
                  ? 'bg-primary text-white'
                  : 'bg-bg text-text-secondary hover:bg-bg-subtle'
              }`}
            >
              <Mic size={16} />
              실시간 녹음
            </button>
            <button
              onClick={() => setInputMode('upload')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
                inputMode === 'upload'
                  ? 'bg-primary text-white'
                  : 'bg-bg text-text-secondary hover:bg-bg-subtle'
              }`}
            >
              <Upload size={16} />
              파일 업로드
            </button>
          </div>
        </div>

        {/* 파일 업로드 드롭존 */}
        {inputMode === 'upload' && (
          <div
            ref={dropRef}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = '.webm,.mp3,.wav,.m4a';
              input.onchange = (e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (file) handleFileSelect(file);
              };
              input.click();
            }}
            className="mb-6 p-8 border-2 border-dashed border-border rounded-lg text-center cursor-pointer hover:border-primary/50 hover:bg-bg-subtle transition-colors"
          >
            {uploadedFile ? (
              <div className="flex items-center justify-center gap-2">
                <FileAudio size={20} className="text-primary" />
                <span className="text-sm font-medium text-text">
                  {uploadedFile.name}
                </span>
                <span className="text-xs text-text-secondary">
                  ({(uploadedFile.size / 1024 / 1024).toFixed(1)} MB)
                </span>
              </div>
            ) : (
              <>
                <Upload size={24} className="mx-auto mb-2 text-text-tertiary" />
                <p className="text-sm text-text-secondary">
                  파일을 드래그하거나 클릭해 선택
                </p>
                <p className="text-xs text-text-tertiary mt-1">
                  지원 형식: .webm .mp3 .wav .m4a
                </p>
              </>
            )}
          </div>
        )}

        {/* 다음 단계 버튼 */}
        <div className="flex justify-end">
          <button
            onClick={handleNext}
            disabled={creating}
            className="px-6 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-hover transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {creating ? '생성 중...' : '다음 단계 →'}
          </button>
        </div>
      </div>

      <Toast
        message={toast.message}
        visible={toast.visible}
        onHide={() => setToast((prev) => ({ ...prev, visible: false }))}
      />
    </WizardLayout>
  );
}
