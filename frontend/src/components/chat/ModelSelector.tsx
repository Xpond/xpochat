'use client';

import { useState, useRef, useEffect } from "react";

interface Model {
  id: string;
  name: string;
}

interface ModelsData {
  defaultModels: Model[];
  byokProviders: Record<string, { name: string; models: Model[] }>;
}

interface Props {
  models: ModelsData;
  activeApiKeys: string[];
  selectedModel: string;
  onSelectModel: (modelId: string) => void;
  /** The button is usually placed in a flex row – allow caller to pass extra class names */
  className?: string;
}

export default function ModelSelector({
  models,
  activeApiKeys,
  selectedModel,
  onSelectModel,
  className = "",
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [openProviders, setOpenProviders] = useState<Record<string, boolean>>({});
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClick = (e: MouseEvent | TouchEvent) => {
      if (open && containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", handleClick);
    window.addEventListener("touchstart", handleClick);
    return () => {
      window.removeEventListener("mousedown", handleClick);
      window.removeEventListener("touchstart", handleClick);
    };
  }, [open]);

  const displayNameForModel = () => {
    // Try default models first
    const def = models.defaultModels.find((m) => m.id === selectedModel);
    if (def) return def.name;

    // Then BYOK
    for (const [, providerData] of Object.entries(models.byokProviders)) {
      const found = providerData.models.find((m) => m.id === selectedModel);
      if (found) return found.name;
    }

    // Fallback – prettify id
    const parts = selectedModel.split("/");
    return parts[1] || selectedModel;
  };

  const handleSelect = (id: string) => {
    onSelectModel(id);
    setOpen(false);
  };

  // Helper to filter models by search term (case-insensitive)
  const matchesSearch = (m: Model) =>
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.id.toLowerCase().includes(search.toLowerCase());

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        onClick={() => setOpen((p) => !p)}
        className="px-4 py-2 text-white rounded-lg transition-all duration-200 text-sm w-full truncate font-medium shadow-lg"
        style={{
          background: `linear-gradient(to right, rgba(var(--teal-primary-rgb, 20, 184, 166), 0.8), rgba(var(--teal-primary-rgb, 20, 184, 166), 0.6))`,
          border: `1px solid rgba(var(--teal-primary-rgb, 20, 184, 166), 0.5)`
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = `linear-gradient(to right, rgba(var(--teal-primary-rgb, 20, 184, 166), 0.9), rgba(var(--teal-primary-rgb, 20, 184, 166), 0.7))`;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = `linear-gradient(to right, rgba(var(--teal-primary-rgb, 20, 184, 166), 0.8), rgba(var(--teal-primary-rgb, 20, 184, 166), 0.6))`;
        }}
      >
        {displayNameForModel()}
      </button>
      {open && (
        <div 
          className="absolute bottom-full mb-2 left-0 right-0 sm:right-0 sm:left-auto sm:w-80 rounded-xl shadow-2xl overflow-hidden z-50 flex flex-col max-h-[60vh] sm:max-h-[70vh]"
          style={{
            background: `rgba(var(--teal-primary-rgb, 20, 184, 166), 0.1)`,
            backdropFilter: 'blur(12px)',
            border: `2px solid rgba(var(--teal-primary-rgb, 20, 184, 166), 0.6)`
          }}
        >
          {/* Search bar */}
          <div 
            className="p-3 sm:p-4 sticky top-0"
            style={{
              background: `rgba(var(--teal-primary-rgb, 20, 184, 166), 0.15)`,
              borderBottom: `1px solid rgba(var(--teal-primary-rgb, 20, 184, 166), 0.3)`
            }}
          >
            <input
              type="text"
              placeholder="Search models..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm text-white placeholder-gray-300 focus:outline-none transition-colors"
              style={{
                background: `rgba(var(--teal-primary-rgb, 20, 184, 166), 0.2)`,
                border: `1px solid rgba(var(--teal-primary-rgb, 20, 184, 166), 0.4)`
              }}
              onFocus={(e) => {
                e.target.style.borderColor = `rgb(var(--teal-primary-rgb, 20, 184, 166))`;
                e.target.style.boxShadow = `0 0 0 2px rgba(var(--teal-primary-rgb, 20, 184, 166), 0.2)`;
              }}
              onBlur={(e) => {
                e.target.style.borderColor = `rgba(var(--teal-primary-rgb, 20, 184, 166), 0.4)`;
                e.target.style.boxShadow = 'none';
              }}
            />
          </div>

          <div 
            className="flex-1 overflow-y-auto p-2 sm:p-3 space-y-2 scrollbar-hide"
            style={{
              background: `rgba(var(--teal-primary-rgb, 20, 184, 166), 0.05)`
            }}
          >
            {/* BYOK models (only for providers with active keys) */}
            {activeApiKeys.length > 0 &&
              Object.entries(models.byokProviders)
                .filter(([providerKey]) => activeApiKeys.includes(providerKey))
                .map(([providerKey, providerData]) => {
                  const inSearch = search.trim().length > 0;
                  const filtered = providerData.models.filter(matchesSearch);
                  if (!inSearch && !filtered.length) return null;

                  // When no search, only show header rows; clicking toggles
                  const isOpen = openProviders[providerKey] || inSearch;

                  return (
                    <div key={providerKey} className="space-y-1">
                      <button
                        onClick={() => setOpenProviders((prev) => ({ ...prev, [providerKey]: !prev[providerKey] }))}
                        className="w-full flex justify-between items-center px-3 py-2.5 sm:py-2 rounded-lg transition-colors font-semibold border border-transparent touch-manipulation"
                        style={{
                          color: `rgb(var(--teal-primary-rgb, 20, 184, 166))`
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = `rgba(var(--teal-primary-rgb, 20, 184, 166), 0.2)`;
                          e.currentTarget.style.borderColor = `rgba(var(--teal-primary-rgb, 20, 184, 166), 0.3)`;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                          e.currentTarget.style.borderColor = 'transparent';
                        }}
                      >
                        <span className="text-left">{providerData.name}</span>
                        <svg
                          className={`w-4 h-4 transform transition-transform ${isOpen ? 'rotate-90' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                      {isOpen &&
                        filtered.map((model) => (
                          <button
                            key={model.id}
                            onClick={() => handleSelect(model.id)}
                            className="w-full text-left px-4 py-2.5 sm:py-2 text-gray-200 transition-all duration-150 text-sm rounded-lg ml-2 border border-transparent touch-manipulation"
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = `rgba(var(--teal-primary-rgb, 20, 184, 166), 0.8)`;
                              e.currentTarget.style.color = 'white';
                              e.currentTarget.style.borderColor = `rgba(var(--teal-primary-rgb, 20, 184, 166), 0.5)`;
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'transparent';
                              e.currentTarget.style.color = 'rgb(229, 231, 235)';
                              e.currentTarget.style.borderColor = 'transparent';
                            }}
                          >
                            {model.name}
                          </button>
                        ))}
                    </div>
                  );
                })}

            {/* Separator */}
            {activeApiKeys.length > 0 && models.defaultModels.length > 0 && (
              <div className="py-2">
                <div 
                  className="border-t"
                  style={{
                    borderColor: `rgba(var(--teal-primary-rgb, 20, 184, 166), 0.4)`
                  }}
                />
              </div>
            )}

            {/* Default models */}
            {(() => {
              const filteredDefaults = models.defaultModels.filter(matchesSearch);
              if (filteredDefaults.length === 0) return null;
              const isOpen = openProviders['default'] || search.trim().length > 0;
              return (
                <div>
                  <button
                    onClick={() => setOpenProviders((p) => ({ ...p, default: !p.default }))}
                    className="w-full flex justify-between items-center px-3 py-2.5 sm:py-2 rounded-lg transition-colors font-semibold border border-transparent touch-manipulation"
                    style={{
                      color: `rgb(var(--teal-primary-rgb, 20, 184, 166))`
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = `rgba(var(--teal-primary-rgb, 20, 184, 166), 0.2)`;
                      e.currentTarget.style.borderColor = `rgba(var(--teal-primary-rgb, 20, 184, 166), 0.3)`;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.borderColor = 'transparent';
                    }}
                  >
                    <span className="text-left">Default Models</span>
                    <svg
                      className={`w-4 h-4 transform transition-transform ${isOpen ? 'rotate-90' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                  {isOpen &&
                    filteredDefaults.map((model) => (
                      <button
                        key={model.id}
                        onClick={() => handleSelect(model.id)}
                        className="w-full text-left px-4 py-2.5 sm:py-2 text-gray-200 transition-all duration-150 text-sm rounded-lg ml-2 border border-transparent touch-manipulation"
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = `rgba(var(--teal-primary-rgb, 20, 184, 166), 0.8)`;
                          e.currentTarget.style.color = 'white';
                          e.currentTarget.style.borderColor = `rgba(var(--teal-primary-rgb, 20, 184, 166), 0.5)`;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                          e.currentTarget.style.color = 'rgb(229, 231, 235)';
                          e.currentTarget.style.borderColor = 'transparent';
                        }}
                      >
                        {model.name}
                      </button>
                    ))}
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
} 