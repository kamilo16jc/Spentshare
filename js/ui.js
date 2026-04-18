// Modal, toast, tab & swipe helpers — shared UI primitives
function openModal(id){
  const m=document.getElementById(id||'addModal');
  if(!m) return;
  m.style.display='flex';
  requestAnimationFrame(()=>{ m.classList.add('show'); });
}

function closeModal(id){
  const m=document.getElementById(id||'addModal');
  if(!m) return;
  m.classList.remove('show');
  setTimeout(()=>{ m.style.display='none'; },300);
}

function closeOnOverlay(e,id){ if(e.target===e.currentTarget) closeModal(id); }

function showToast(msg,duration=2500){
  const t=document.getElementById('toast');
  if(!t) return;
  t.textContent=msg;
  t.style.opacity='1';t.style.transform='translateX(-50%) translateY(0)';
  clearTimeout(showToast._t);
  showToast._t=setTimeout(()=>{ t.style.opacity='0';t.style.transform='translateX(-50%) translateY(-20px)'; },duration);
}

function setTab(btn){
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
}

// ── SWIPE TO CLOSE MODALS ──
(function(){
  let startY = 0, lastY = 0, activeModal = null, activeOverlay = null;

  document.addEventListener('touchstart', e => {
    const modal = e.target.closest('.modal');
    if(!modal) return;
    const overlay = modal.closest('.modal-overlay');
    if(!overlay || !overlay.classList.contains('show')) return;
    startY = e.touches[0].clientY;
    lastY = startY;
    activeModal = modal;
    activeOverlay = overlay;
    modal.style.transition = 'none';
  }, {passive: true});

  document.addEventListener('touchmove', e => {
    if(!activeModal) return;
    lastY = e.touches[0].clientY;
    const diff = lastY - startY;
    if(diff > 0){
      activeModal.style.transform = `translateY(${diff}px)`;
    }
  }, {passive: true});

  document.addEventListener('touchend', () => {
    if(!activeModal) return;
    const diff = lastY - startY;
    activeModal.style.transition = 'transform 0.35s ease';
    if(diff > 100){
      activeModal.style.transform = 'translateY(110%)';
      const overlayToClose = activeOverlay;
      const modalToReset = activeModal;
      setTimeout(()=>{
        overlayToClose.classList.remove('show');
        overlayToClose.style.display = 'none';
        modalToReset.style.transform = '';
        modalToReset.style.transition = '';
      }, 360);
    } else {
      activeModal.style.transform = 'translateY(0)';
      setTimeout(()=>{ if(activeModal) activeModal.style.transition = ''; }, 360);
    }
    startY = 0; lastY = 0; activeModal = null; activeOverlay = null;
  });
})();

function initSwipeModals(){ /* swipe is handled globally */ }
