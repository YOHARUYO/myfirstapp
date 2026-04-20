import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function Settings() {
  const navigate = useNavigate();

  return (
    <div className="max-w-3xl mx-auto min-h-screen p-6">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate('/')}
          className="text-text-secondary hover:text-text transition-colors cursor-pointer"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-lg font-semibold text-text">설정</h1>
      </div>
      <div className="py-8 text-center border border-dashed border-border rounded-lg">
        <p className="text-sm text-text-tertiary">준비 중</p>
      </div>
    </div>
  );
}
