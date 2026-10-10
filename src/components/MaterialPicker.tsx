import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronDown } from 'lucide-react';
import { Material } from '../types';

interface MaterialPickerProps {
  id: string;
  value: string;
  materials: Material[];
  onChange: (value: string) => void;
}

export default function MaterialPicker({ id, value, materials, onChange }: MaterialPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const options = [
    { key: 'none', value: '', label: 'Kein Material ausgewählt' },
    ...materials.map(material => ({ key: material.id, value: material.name, label: material.name }))
  ];
  const selectedIndex = Math.max(0, options.findIndex(option => option.value === value));

  useEffect(() => {
    if (!isOpen) return;

    optionRefs.current[selectedIndex]?.focus();
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
  }, [isOpen]);

  const selectOption = (selectedValue: string) => {
    onChange(selectedValue);
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const handleOptionKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const nextIndex = (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
      optionRefs.current[nextIndex]?.focus();
    }
  };

  return (
    <div ref={containerRef} className="relative w-full" onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) setIsOpen(false);
    }}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={`${id}-options`}
        onClick={() => setIsOpen(open => !open)}
        onKeyDown={event => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setIsOpen(true);
          }
        }}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-left focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      >
        <span className="truncate">{options.find(option => option.value === value)?.label ?? value}</span>
        <ChevronDown className="h-4 w-4 flex-none" aria-hidden="true" />
      </button>

      {isOpen && (
        <div id={`${id}-options`} role="listbox" aria-label="Material auswählen" className="absolute left-0 right-0 z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-gray-300 bg-white shadow-lg">
          {options.map((option, index) => (
            <button
              key={option.key}
              ref={element => { optionRefs.current[index] = element; }}
              type="button"
              role="option"
              aria-selected={option.value === value}
              onClick={() => selectOption(option.value)}
              onKeyDown={event => handleOptionKeyDown(event, index)}
              className={`block w-full px-3 py-2 text-left hover:bg-blue-50 focus:bg-blue-100 focus:outline-none ${option.value === value ? 'bg-blue-50' : ''}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
