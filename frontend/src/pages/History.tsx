import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, Clock, Users, Hash, Check } from 'lucide-react';
import { listMeetings, searchMeetings } from '../api/history';
import type { MeetingListItem } from '../types';

export default function History() {
  const navigate = useNavigate();
  const [meetings, setMeetings] = useState<MeetingListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    listMeetings()
      .then(setMeetings)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSearch = async () => {
    if (!searchQuery.trim() && !dateFrom && !dateTo) {
      setLoading(true);
      listMeetings()
        .then(setMeetings)
        .finally(() => setLoading(false));
      return;
    }
    setSearching(true);
    try {
      const results = await searchMeetings(searchQuery || undefined, dateFrom || undefined, dateTo || undefined);
      setMeetings(results);
    } catch {}
    setSearching(false);
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '';
    const m = Math.floor(seconds / 60);
    return `${m}분`;
  };

  const FIELD_LABELS: Record<string, string> = {
    title: '제목', participants: '참여자', keywords: '키워드', summary: '요약', transcript: '전사',
  };

  const highlightMatch = (text: string, query: string) => {
    if (!query) return text;
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.split(regex).map((part, i) =>
      regex.test(part) ? <mark key={i} className="bg-primary/15 text-text px-0.5 rounded">{part}</mark> : part
    );
  };

  return (
    <div className="max-w-3xl mx-auto min-h-screen px-6 md:px-10 pt-20">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <button
          onClick={() => navigate('/')}
          className="text-text-secondary hover:text-text transition-colors cursor-pointer"
        >
          <ArrowLeft size={20} />
        </button>
      </div>
      <h1 className="text-[40px] font-bold leading-tight text-text">히스토리</h1>

      {/* Search */}
      <div className="mt-8 flex gap-2">
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="제목, 참여자, 키워드, 전사 내용 검색"
            className="w-full bg-bg-subtle rounded-lg pl-10 pr-4 py-3 text-[15px] focus:bg-bg focus:ring-2 focus:ring-primary focus:outline-none"
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={searching}
          className="px-4 py-3 text-[15px] font-medium text-bg bg-primary rounded-lg hover:bg-primary-hover cursor-pointer disabled:opacity-50"
        >
          검색
        </button>
      </div>

      {/* Date filter */}
      <div className="mt-3 flex items-center gap-2">
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
          className="bg-bg-subtle rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none" />
        <span className="text-text-tertiary">~</span>
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
          className="bg-bg-subtle rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none" />
      </div>

      {/* List */}
      <div className="mt-12 space-y-3">
        {loading && (
          <p className="text-sm text-text-tertiary text-center py-8">로딩 중...</p>
        )}
        {!loading && meetings.length === 0 && (
          <div className="py-8 text-center border border-dashed border-border rounded-lg">
            <p className="text-sm text-text-tertiary">
              {searchQuery ? '검색 결과가 없습니다' : '회의 기록이 없습니다'}
            </p>
          </div>
        )}
        {meetings.map((m) => (
          <button
            key={m.meeting_id}
            onClick={() => navigate(`/history/${m.meeting_id}`)}
            className="w-full text-left bg-bg-subtle rounded-xl p-5 hover:bg-bg-hover cursor-pointer transition-colors"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <h3 className="text-[15px] font-semibold text-text truncate">
                  {m.date && <span className="text-text-secondary font-normal mr-2">{m.date}</span>}
                  {m.title}
                </h3>
                <div className="flex items-center gap-4 mt-2 text-xs text-text-tertiary">
                  {m.duration_seconds && (
                    <span className="flex items-center gap-1">
                      <Clock size={12} />
                      {formatDuration(m.duration_seconds)}
                    </span>
                  )}
                  {m.participants.length > 0 && (
                    <span className="flex items-center gap-1">
                      <Users size={12} />
                      {m.participants.join(', ')}
                    </span>
                  )}
                </div>
                {searchQuery && m.snippet && (
                  <div className="mt-1.5 text-xs text-text-tertiary">
                    {m.matched_field && (
                      <span className="text-primary font-medium mr-1.5">{FIELD_LABELS[m.matched_field] || m.matched_field}</span>
                    )}
                    <span>{highlightMatch(m.snippet, searchQuery)}</span>
                  </div>
                )}
              </div>
              <div className="shrink-0 flex items-center gap-2">
                {m.slack_sent && (
                  <span className="flex items-center gap-1 text-xs text-success">
                    <Hash size={12} />
                    전송됨
                  </span>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
