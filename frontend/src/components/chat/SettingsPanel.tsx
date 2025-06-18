'use client';

import React from 'react';
import { fetchWithAuth } from '../../utils/fetchWithAuth';

interface SettingsPanelProps {
  rightPanelOpen: boolean;
  width: string;
  models: { defaultModels: any[]; byokProviders: any };
  configuringProvider: string | null;
  setConfiguringProvider: React.Dispatch<React.SetStateAction<string | null>>;
  apiKeys: { [key: string]: string };
  setApiKeys: React.Dispatch<React.SetStateAction<{ [key: string]: string }>>;
  showApiKey: { [key: string]: boolean };
  setShowApiKey: React.Dispatch<React.SetStateAction<{ [key: string]: boolean }>>;
  getToken: () => Promise<string | null>;
  fetchActiveKeys: () => Promise<void>;
  fetchModels: () => Promise<void>;
  // Theme controls
  selectedColor: string;
  setSelectedColor: React.Dispatch<React.SetStateAction<string>>;
  gradientType: string;
  setGradientType: React.Dispatch<React.SetStateAction<string>>;
  containerOpacity: number;
  setContainerOpacity: React.Dispatch<React.SetStateAction<number>>;
  fontSize: number;
  setFontSize: React.Dispatch<React.SetStateAction<number>>;
  changeTheme: (color: string, gradType?: string) => void;
  markThemeAdjustment: () => void;
  /** Callback fired when the mouse leaves the panel so the parent can close it. */
  onClose: () => void;
}

/**
 * Right-side account/settings panel extracted from page.tsx.
 * All callbacks/state are forwarded in as props so the original
 * behaviour is preserved exactly.
 */
const SettingsPanel: React.FC<SettingsPanelProps> = ({
  rightPanelOpen,
  width,
  models,
  configuringProvider,
  setConfiguringProvider,
  apiKeys,
  setApiKeys,
  showApiKey,
  setShowApiKey,
  getToken,
  fetchActiveKeys,
  fetchModels,
  selectedColor,
  setSelectedColor,
  gradientType,
  setGradientType,
  containerOpacity,
  setContainerOpacity,
  fontSize,
  setFontSize,
  changeTheme,
  markThemeAdjustment,
  onClose,
}) => {
  
  // Debounced opacity change handler
  const handleOpacityChange = (newOpacity: number) => {
    setContainerOpacity(newOpacity);

    // Update the CSS variable immediately for snappy UI feedback
    const actualOpacity = 0.9 - (newOpacity * 0.8) / 100;
    if (typeof document !== 'undefined') {
      document.documentElement.style.setProperty('--container-opacity', actualOpacity.toString());
    }

    // Mark theme adjustment to keep panels open
    markThemeAdjustment();
  };

  // Debounced font size change handler
  const handleFontSizeChange = (newFontSize: number) => {
    setFontSize(newFontSize);

    const actualFontSize = 0.75 + (newFontSize - 50) * 0.5 / 100;
    if (typeof document !== 'undefined') {
      document.documentElement.style.setProperty('--container-font-size', `${actualFontSize}rem`);
    }

    // Mark theme adjustment to keep panels open
    markThemeAdjustment();
  };

  return (
    <aside
      style={{ 
        width, 
        top: '5rem', 
        bottom: '1rem',
        backgroundColor: `rgba(var(--teal-primary-rgb, 20, 184, 166), var(--container-opacity, 0.26))`
      }}
      onMouseLeave={onClose}
      className={`fixed right-0 backdrop-blur-sm p-4 pr-8 transition-transform duration-300 z-20 overflow-y-auto overflow-x-hidden scrollbar-hide container-font rounded-lg ${
        rightPanelOpen ? 'translate-x-0' : 'translate-x-[110%]'
      }`}
    >
      <div className="space-y-4 overflow-y-auto overflow-x-hidden scrollbar-hide">
        
        {/* Settings header to match New Chat level */}
        <div className="flex gap-2 mb-3">
          <div className="flex-1 py-2 text-sm font-medium text-gray-300 text-center">Settings</div>
        </div>
        
        {/* BYOK Configuration - starts at search box level */}
        <div className="space-y-3">
          {['openrouter', 'openai', 'anthropic', 'google', 'grok', 'elevenlabs'].map((provider: string) => {
            const providerName = models.byokProviders[provider]?.name || {
              openrouter: 'OpenRouter',
              openai: 'OpenAI',
              anthropic: 'Anthropic',
              google: 'Google AI',
              grok: 'Groq',
              elevenlabs: 'ElevenLabs',
            }[provider];

            return (
              <div key={provider} className="space-y-2">
                <button
                  onClick={() => setConfiguringProvider(
                    configuringProvider === provider ? null : provider
                  )}
                  style={{ backgroundColor: 'rgba(0,0,0,0.2)' }}
                  className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-black/30 transition-colors container-font"
                >
                    <div className="flex items-center gap-2">
                    <div className="text-gray-300">{providerName}</div>
                      {apiKeys[provider] && (
                        <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                      )}
                  </div>

                  {/* Chevron */}
                    <svg
                      className={`w-4 h-4 text-gray-400 transform transition-all duration-200 ${
                        configuringProvider === provider ? 'rotate-90' : ''
                      }`}
                      style={{ color: 'rgba(var(--teal-primary-rgb, 20, 184, 166), 0.6)' }}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                </button>

                {/* Expandable configuration section */}
                {configuringProvider === provider && (
                  <div 
                    className="space-y-3 p-4 bg-black/40 border rounded-lg"
                    style={{ borderColor: 'rgba(var(--teal-primary-rgb, 20, 184, 166), 0.3)' }}
                  >
                    <div className="relative">
                      <input
                        id={`api-key-${provider.toLowerCase()}`}
                        name={`apiKey${provider}`}
                        type={showApiKey[provider] ? 'text' : 'password'}
                        value={apiKeys[provider] || ''}
                        onChange={(e) =>
                          setApiKeys((prev) => ({ ...prev, [provider]: e.target.value }))
                        }
                        placeholder="Enter API Key..."
                        className="w-full bg-black/40 border rounded-lg px-4 py-3 text-white placeholder-gray-400 pr-12 transition-colors container-font"
                        style={{ 
                          borderColor: 'rgba(var(--teal-primary-rgb, 20, 184, 166), 0.4)',
                        }}
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = 'rgb(var(--teal-primary-rgb, 20, 184, 166))';
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = 'rgba(var(--teal-primary-rgb, 20, 184, 166), 0.4)';
                        }}
                        autoComplete="off"
                        autoCorrect="off"
                        spellCheck={false}
                      />
                      
                      {/* Show/Hide button */}
                      <button
                        type="button"
                        onClick={() =>
                          setShowApiKey((prev) => ({ ...prev, [provider]: !prev[provider] }))
                        }
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                      >
                        {showApiKey[provider] ? (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                          </svg>
                        )}
                      </button>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={async () => {
                          try {
                            const res = await fetchWithAuth(getToken, '/api/user/keys', {
                              method: 'POST',
                              headers: {
                                'Content-Type': 'application/json',
                              },
                              body: JSON.stringify({
                                provider,
                                apiKey: apiKeys[provider],
                              }),
                            });

                            if (!res?.ok) {
                              const msg = await res?.text();
                              throw new Error(`Failed to save API key: ${res?.status} ${msg}`);
                            }

                            await Promise.all([fetchActiveKeys(), fetchModels()]);
                          } catch (error: any) {
                                  console.error('Error saving API key:', error);
      // TODO: Replace with proper toast notification in production
      if (process.env.NODE_ENV === 'development') {
        alert(`Error saving API key: ${error.message}`);
      }
                          }
                        }}
                        className="flex-1 px-4 py-2 text-white rounded-lg transition-colors container-font"
                        style={{ 
                          backgroundColor: 'rgba(var(--teal-primary-rgb, 20, 184, 166), 0.8)',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = 'rgb(var(--teal-primary-rgb, 20, 184, 166))';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'rgba(var(--teal-primary-rgb, 20, 184, 166), 0.8)';
                        }}
                      >
                        Save
                      </button>
                      <button
                        onClick={async () => {
                          try {
                            const res = await fetchWithAuth(getToken, `/api/user/keys/${provider}`, {
                              method: 'DELETE',
                            });

                            if (!res?.ok) {
                              const msg = await res?.text();
                              throw new Error(`Failed to delete API key: ${res?.status} ${msg}`);
                            }

                            setApiKeys((prev) => {
                              const newKeys = { ...prev };
                              delete newKeys[provider];
                              return newKeys;
                            });
                            await Promise.all([fetchActiveKeys(), fetchModels()]);
                          } catch (error: any) {
                                  console.error('Error deleting API key:', error);
      // TODO: Replace with proper toast notification in production
      if (process.env.NODE_ENV === 'development') {
        alert(`Error deleting API key: ${error.message}`);
      }
                          }
                        }}
                        className="px-4 py-2 text-white bg-red-600/80 hover:bg-red-600 rounded-lg transition-colors container-font"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Theme Controls Section */}
        <div className="border-t border-teal-800/30 pt-4">
          <h3 className="text-sm font-medium text-gray-300 mb-4">Theme Customization</h3>
          
          {/* Color Picker */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-300 mb-2">Primary Color</label>
              <div className="flex items-center gap-3">
                <div className="color-input-wrapper">
                  <input
                    type="color"
                    value={selectedColor}
                    onChange={(e) => {
                      setSelectedColor(e.target.value);
                      changeTheme(e.target.value, gradientType);
                    }}
                    className="rounded-full border-none p-0 appearance-none cursor-pointer"
                    style={{ backgroundColor: selectedColor, width: '14px', height: '14px' }}
                  />
                </div>
                <div className="flex-1">
                  <input
                    type="text"
                    value={selectedColor}
                    onChange={(e) => {
                      if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
                        setSelectedColor(e.target.value);
                        changeTheme(e.target.value, gradientType);
                      }
                    }}
                    className="w-full bg-black/40 border border-teal-800/40 rounded-lg px-3 py-2 text-white text-sm font-mono"
                    placeholder="#1a4a4a"
                  />
                </div>
              </div>
            </div>

            {/* Gradient Type */}
            <div>
              <label className="block text-xs text-gray-300 mb-2">Background Style</label>
              <select 
                value={gradientType}
                onChange={(e) => {
                  setGradientType(e.target.value);
                  changeTheme(selectedColor, e.target.value);
                }}
                className="custom-select container-font"
              >
                <option value="linear-diagonal">Linear Diagonal</option>
                <option value="linear-vertical">Linear Vertical</option>
                <option value="linear-horizontal">Linear Horizontal</option>
                <option value="radial-center">Radial Center</option>
                <option value="radial-corner">Radial Corner</option>
                <option value="conic">Conic</option>
                <option value="solid">Solid Color</option>
              </select>
            </div>

            {/* Container Opacity */}
            <div>
              <label className="block text-xs text-gray-300 mb-2">
                Container Transparency ({containerOpacity}%)
              </label>
              <div className="space-y-2">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={containerOpacity}
                  onChange={(e) => handleOpacityChange(parseInt(e.target.value))}
                  className="w-full opacity-slider"
                  style={{
                    background: `linear-gradient(to right, 
                      rgba(var(--teal-primary-rgb, 20, 184, 166), 0.3) 0%, 
                      rgba(var(--teal-primary-rgb, 20, 184, 166), 0.6) ${containerOpacity}%, 
                      rgba(255, 255, 255, 0.1) ${containerOpacity}%, 
                      rgba(255, 255, 255, 0.1) 100%)`
                  }}
                />
                <div className="flex justify-between text-xs text-gray-400">
                  <span>Solid</span>
                  <span>Transparent</span>
                </div>
              </div>
            </div>

            {/* Font Size */}
            <div>
              <label className="block text-xs text-gray-300 mb-2">
                Font Size ({fontSize}%)
              </label>
              <div className="space-y-2">
                <input
                  type="range"
                  min="50"
                  max="150"
                  value={fontSize}
                  onChange={(e) => handleFontSizeChange(parseInt(e.target.value))}
                  className="w-full opacity-slider"
                  style={{
                    background: `linear-gradient(to right, 
                      rgba(var(--teal-primary-rgb, 20, 184, 166), 0.3) 0%, 
                      rgba(var(--teal-primary-rgb, 20, 184, 166), 0.6) ${(fontSize - 50) * 100 / 100}%, 
                      rgba(255, 255, 255, 0.1) ${(fontSize - 50) * 100 / 100}%, 
                      rgba(255, 255, 255, 0.1) 100%)`
                  }}
                />
                <div className="flex justify-between text-xs text-gray-400">
                  <span>Small</span>
                  <span>Large</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>


    </aside>
  );
};

export default SettingsPanel; 