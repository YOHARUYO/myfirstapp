import { useEffect, useState, useRef } from 'react';

interface Props {
  message: string;
  visible: boolean;
  onHide: () => void;
  duration?: number;
}

export default function Toast({ message, visible, onHide, duration = 3000 }: Props) {
  const [show, setShow] = useState(false);
  const onHideRef = useRef(onHide);
  onHideRef.current = onHide;

  useEffect(() => {
    if (visible) {
      setShow(true);
      const timer = setTimeout(() => {
        setShow(false);
        setTimeout(() => onHideRef.current(), 300);
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [visible, duration]);

  if (!visible && !show) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
      <div
        className={`px-4 py-2.5 bg-text text-white text-sm rounded-lg shadow-lg transition-all duration-300 ${
          show ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
        }`}
      >
        {message}
      </div>
    </div>
  );
}
