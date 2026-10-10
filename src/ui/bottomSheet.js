// Collapsible bottom sheet: tap the handle or swipe it up/down.

export function initBottomSheet(sheet, handle, { onChange } = {}) {
  const setOpen = (open) => {
    sheet.dataset.open = String(open);
    handle.setAttribute('aria-expanded', String(open));
    handle.querySelector('.visually-hidden').textContent = open ? 'Hide statistics' : 'Show statistics';
    onChange?.(open);
  };

  let startY = null;
  let swiped = false;
  handle.addEventListener('pointerdown', (e) => {
    startY = e.clientY;
    swiped = false;
    handle.setPointerCapture?.(e.pointerId);
  });
  handle.addEventListener('pointermove', (e) => {
    if (startY === null || swiped) return;
    const dy = e.clientY - startY;
    if (Math.abs(dy) > 24) {
      swiped = true;
      setOpen(dy < 0);
    }
  });
  handle.addEventListener('pointerup', () => { startY = null; });
  handle.addEventListener('pointercancel', () => { startY = null; });
  handle.addEventListener('click', () => {
    if (swiped) { swiped = false; return; }
    setOpen(sheet.dataset.open !== 'true');
  });

  return { setOpen, isOpen: () => sheet.dataset.open === 'true' };
}
