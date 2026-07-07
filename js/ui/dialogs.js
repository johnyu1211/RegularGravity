function showConfirm(msg, onOk) {
    return new Promise((resolve) => {
        const modal = document.getElementById('custom-confirm-modal');
        const msgEl = document.getElementById('confirm-message');
        const okBtn = document.getElementById('confirm-ok');
        const cancelBtn = document.getElementById('confirm-cancel');
        const closeBtn = document.getElementById('close-confirm');

        if (!modal || !msgEl) return resolve(false);
        msgEl.innerText = msg; modal.style.display = 'flex'; if (cancelBtn) cancelBtn.style.display = 'inline-block';
        const hide = () => { modal.style.display = 'none'; };
        okBtn.onclick = () => { hide(); if (onOk) onOk(); resolve(true); };
        cancelBtn.onclick = () => { hide(); resolve(false); };
        closeBtn.onclick = () => { hide(); resolve(false); };
        modal.onclick = (e) => { if (e.target === modal) { hide(); resolve(false); } };
    });
}

function showAlert(msg, onOk) {
    return new Promise((resolve) => {
        const modal = document.getElementById('custom-confirm-modal');
        const msgEl = document.getElementById('confirm-message');
        const okBtn = document.getElementById('confirm-ok');
        const cancelBtn = document.getElementById('confirm-cancel');
        const closeBtn = document.getElementById('close-confirm');

        if (!modal || !msgEl) return resolve(true);
        msgEl.innerText = msg; modal.style.display = 'flex'; if (cancelBtn) cancelBtn.style.display = 'inline-block';
        const hide = () => { modal.style.display = 'none'; };
        okBtn.onclick = () => { hide(); if (onOk) onOk(); resolve(true); };
        cancelBtn.onclick = () => { hide(); resolve(false); };
        closeBtn.onclick = () => { hide(); resolve(false); }; 
        modal.onclick = (e) => { if (e.target === modal) { hide(); resolve(false); } };
    });
}
