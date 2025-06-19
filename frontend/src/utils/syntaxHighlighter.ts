// Cache compiled regex patterns for performance
const regexCache = new Map<string, RegExp>();

// Optimized keyword sets - only common, essential keywords
const KEYWORDS = {
  js: ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'class', 'import', 'export', 'async', 'await', 'new', 'this'],
  py: ['def', 'return', 'if', 'elif', 'else', 'for', 'while', 'class', 'import', 'from', 'as', 'try', 'except', 'True', 'False', 'None'],
  java: ['public', 'private', 'protected', 'static', 'void', 'int', 'String', 'boolean', 'class', 'interface', 'extends', 'implements', 'new', 'this'],
  cpp: ['int', 'char', 'bool', 'void', 'class', 'struct', 'public', 'private', 'protected', 'virtual', 'const', 'static', 'namespace', 'using'],
  cs: ['public', 'private', 'protected', 'static', 'void', 'int', 'string', 'bool', 'class', 'interface', 'namespace', 'using', 'var', 'new'],
  go: ['func', 'var', 'const', 'type', 'struct', 'interface', 'package', 'import', 'if', 'else', 'for', 'range', 'return', 'defer'],
  rust: ['fn', 'let', 'mut', 'const', 'struct', 'enum', 'impl', 'trait', 'pub', 'use', 'mod', 'if', 'else', 'match', 'for', 'while'],
  php: ['function', 'class', 'public', 'private', 'protected', 'static', 'const', 'var', 'if', 'else', 'foreach', 'while', 'return', 'new'],
  rb: ['def', 'class', 'module', 'if', 'else', 'elsif', 'end', 'while', 'for', 'do', 'return', 'yield', 'true', 'false', 'nil'],
  swift: ['func', 'var', 'let', 'class', 'struct', 'enum', 'protocol', 'if', 'else', 'for', 'while', 'return', 'public', 'private'],
  kt: ['fun', 'val', 'var', 'class', 'interface', 'object', 'if', 'else', 'when', 'for', 'while', 'return', 'public', 'private'],
  scala: ['def', 'val', 'var', 'class', 'object', 'trait', 'if', 'else', 'for', 'while', 'match', 'case', 'return', 'import'],
  sql: ['SELECT', 'FROM', 'WHERE', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'TABLE', 'INDEX', 'JOIN', 'INNER', 'LEFT', 'RIGHT'],
  sh: ['if', 'then', 'else', 'elif', 'fi', 'for', 'do', 'done', 'while', 'case', 'esac', 'function', 'echo', 'export'],
  html: ['html', 'head', 'body', 'div', 'span', 'title', 'meta', 'link', 'script', 'style', 'DOCTYPE'],
  css: ['body', 'div', 'span', 'header', 'nav', 'main', 'section', 'footer']
};

// Language alias mapping for common variations
const LANG_ALIASES: Record<string, string> = {
  'javascript': 'js', 'typescript': 'js', 'jsx': 'js', 'tsx': 'js', 'node': 'js',
  'python': 'py', 'python3': 'py', 'py3': 'py',
  'c++': 'cpp', 'cxx': 'cpp', 'cc': 'cpp',
  'c#': 'cs', 'csharp': 'cs',
  'golang': 'go',
  'ruby': 'rb',
  'kotlin': 'kt',
  'bash': 'sh', 'zsh': 'sh', 'fish': 'sh', 'shell': 'sh',
  'xml': 'html', 'htm': 'html',
  'scss': 'css', 'sass': 'css', 'less': 'css'
};

// Pre-compiled shared patterns for maximum performance
const SHARED_PATTERNS = {
  comment: /(\/\*[^*]*(?:\*(?!\/)[^*]*)*\*\/|\/\/[^\r\n]*|#[^\r\n]*|<!--(?:[^-]|-(?!->))*-->)/gm,
  string: /("[^"]*"|'[^']*'|`[^`]*`)/g,
  number: /\b(0x[\da-fA-F]+|\d+\.\d+|\d+)\b/g
};

function getKeywordPattern(lang: string): RegExp | null {
  const normalizedLang = LANG_ALIASES[lang] || lang;
  const keywords = KEYWORDS[normalizedLang as keyof typeof KEYWORDS];
  
  if (!keywords) return null;
  
  const cacheKey = `keywords_${normalizedLang}`;
  if (!regexCache.has(cacheKey)) {
    regexCache.set(cacheKey, new RegExp(`\\b(${keywords.join('|')})\\b`, 'g'));
  }
  
  return regexCache.get(cacheKey)!;
}

export function highlightCode(code: string, lang: string = 'generic'): string {
  // Fast escape - inline for performance
  let html = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Apply patterns in order (comments first to prevent nested highlighting)
  html = html.replace(SHARED_PATTERNS.comment, '<span class="syntax-comment">$1</span>');
  html = html.replace(SHARED_PATTERNS.string, '<span class="syntax-string">$&</span>');
  html = html.replace(SHARED_PATTERNS.number, '<span class="syntax-number">$&</span>');

  // Apply keywords if language is supported
  const keywordPattern = getKeywordPattern(lang.toLowerCase());
  if (keywordPattern) {
    html = html.replace(keywordPattern, '<span class="syntax-keyword">$1</span>');
  }

  return html;
} 