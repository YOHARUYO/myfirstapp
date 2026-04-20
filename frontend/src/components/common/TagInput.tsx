import { useState, useRef } from 'react';
import { X } from 'lucide-react';

interface Props {
  values: string[];
  onChange: (values: string[]) => void;
  suggestions: string[];
  placeholder?: string;
  highlighted?: boolean;
}

export default function TagInput({ values, onChange, suggestions, placeholder, highlighted }: Props) {
  const [input, setInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = suggestions.filter(
    (s) => s.toLowerCase().includes(input.toLowerCase()) && !values.includes(s)
  );

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (trimmed && !values.includes(trimmed)) {
      onChange([...values, trimmed]);
    }
    setInput('');
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  const removeTag = (tag: string) => {
    onChange(values.filter((v) => v !== tag));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && input.trim()) {
      e.preventDefault();
      addTag(input);
    } else if (e.key === 'Backspace' && !input && values.length > 0) {
      removeTag(values[values.length - 1]);
    }
  };

  return (
    <div className="relative">
      <div
        className={`flex flex-wrap gap-1.5 px-4 py-3 rounded-lg min-h-[46px] items-center cursor-text transition-colors ${
          highlighted ? 'bg-template' : 'bg-bg-subtle'
        } focus-within:bg-white focus-within:ring-2 focus-within:ring-primary`}
        onClick={() => inputRef.current?.focus()}
      >
        {values.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 px-2 py-0.5 bg-bg-subtle text-sm text-text rounded-md"
          >
            {v}
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeTag(v);
              }}
              className="text-text-tertiary hover:text-text cursor-pointer"
            >
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          onKeyDown={handleKeyDown}
          placeholder={values.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[80px] outline-none text-sm bg-transparent"
        />
      </div>
      {showSuggestions && filtered.length > 0 && (
        <div className="absolute z-10 mt-1 w-full bg-bg border border-border rounded-lg shadow-lg py-1 max-h-40 overflow-y-auto">
          {filtered.map((s) => (
            <button
              key={s}
              onMouseDown={(e) => {
                e.preventDefault();
                addTag(s);
              }}
              className="w-full text-left px-3 py-1.5 text-sm text-text hover:bg-bg-subtle cursor-pointer"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
