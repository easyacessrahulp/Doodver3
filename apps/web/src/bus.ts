// Tiny event bus: lets any screen open the AI wizards (hosted once in the app shell).
export type FollowDetail = { taskId: string; subtaskId?: string | null; personId?: string | null; followupId?: string | null; title?: string };
export const openFollowUp = (d: FollowDetail) => dispatchEvent(new CustomEvent('cc-followup', { detail: d }));
export const openQuickAdd = (d: { text?: string } = {}) => dispatchEvent(new CustomEvent('cc-quickadd', { detail: d }));
export const openLetter = (d: { taskId?: string } = {}) => dispatchEvent(new CustomEvent('cc-letter', { detail: d }));
export const openPalette = () => dispatchEvent(new Event('cc-palette'));
export const openFocusPicker = () => dispatchEvent(new Event('cc-focus-picker'));
/** WhatsApp Web with the message already typed — the person presses Send. Indian numbers get +91 if no country code. */
export function whatsappUrl(phone: string | null | undefined, text: string) {
  const d = String(phone ?? '').replace(/[^\d]/g, '').replace(/^0+/, '');
  const full = d.length === 10 ? '91' + d : d;
  return `https://web.whatsapp.com/send?${full ? `phone=${full}&` : ''}text=${encodeURIComponent(text)}`;
}
export const openWhatsApp = (phone: string | null | undefined, text: string) => { window.open(whatsappUrl(phone, text), '_blank', 'noopener'); };
