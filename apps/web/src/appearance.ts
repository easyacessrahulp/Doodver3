// Appearance choices (saved on this computer): theme, density, text size.
export type Theme = 'auto' | 'light' | 'dark'; export type Density = 'comfortable' | 'compact'; export type TextSize = 'normal' | 'large';
const get = (k: string, d: string) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const set = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };
export const getAppearance = () => ({ theme: get('cc.theme', 'auto') as Theme, density: get('cc.density', 'comfortable') as Density, text: get('cc.text', 'normal') as TextSize });
export function applyAppearance(a = getAppearance()) {
  const r = document.documentElement;
  if (a.theme === 'auto') delete r.dataset.theme; else r.dataset.theme = a.theme;   // Auto = the CSS follows the computer's setting, and changes live
  r.dataset.density = a.density; r.style.setProperty('--ts', a.text === 'large' ? '1.15' : '1');
}
export function setAppearance(p: Partial<ReturnType<typeof getAppearance>>) {
  if (p.theme) set('cc.theme', p.theme); if (p.density) set('cc.density', p.density); if (p.text) set('cc.text', p.text);
  applyAppearance();
}
