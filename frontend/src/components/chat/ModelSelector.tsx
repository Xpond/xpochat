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
    const handleClick = (e: MouseEvent) => {
      if (open && containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", handleClick);
    return () => window.removeEventListener("mousedown", handleClick);
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
        className="px-3 py-2 bg-teal-800/30 text-teal-300 rounded-lg hover:bg-teal-800/50 transition-colors text-base"
      >
        {displayNameForModel()}
      </button>
      {open && (
        <div className="absolute bottom-full mb-2 right-0 w-[36rem] bg-black/60 backdrop-blur-md border border-teal-800/30 rounded-lg shadow-xl overflow-hidden z-50 flex flex-col max-h-[70vh]">
          {/* Search bar */}
          <div className="p-3 border-b border-teal-800/30 bg-black/70 sticky top-0">
            <input
              type="text"
              placeholder="Search models..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-black/20 border border-teal-800/30 rounded px-3 py-2 text-base text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-hide">
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
                        className="w-full flex justify-between items-center px-2 py-1 text-teal-300 hover:bg-black/20 rounded transition-colors"
                      >
                        <span>{providerData.name}</span>
                        <svg
                          className={`w-3 h-3 transform transition-transform ${isOpen ? 'rotate-90' : ''}`}
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
                            className="w-full text-left px-3 py-1.5 text-gray-300 hover:bg-black/30 hover:text-white transition-colors text-base rounded"
                          >
                            {model.name}
                          </button>
                        ))}
                    </div>
                  );
                })}

            {/* Separator */}
            {activeApiKeys.length > 0 && models.defaultModels.length > 0 && (
              <div className="pt-2">
                <div className="border-t border-teal-800/30" />
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
                    className="w-full flex justify-between items-center px-2 py-1 text-teal-300 hover:bg-black/20 rounded transition-colors"
                  >
                    <span>Default Models</span>
                    <svg
                      className={`w-3 h-3 transform transition-transform ${isOpen ? 'rotate-90' : ''}`}
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
                        className="w-full text-left px-3 py-1.5 text-gray-300 hover:bg-black/30 hover:text-white transition-colors text-base rounded"
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