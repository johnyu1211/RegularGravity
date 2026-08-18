const _path = require('path');

window.getSendingMdTimeTag = function() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}h${pad(d.getMinutes())}m${pad(d.getSeconds())}s`;
};

window.getSendingMdFolderTag = function() {
    try {
        const cur = window.currentPath || window.projectRoot || (window.activeWebDirHandle && window.activeWebDirHandle.name) || 'Project';
        const name = _path.basename(cur) || 'Project';
        return name.replace(/[^\w\u3131-\u318E\uAC00-\uD7A3\-]/gi, '_').replace(/_+/g, '_') || 'Project';
    } catch(e) {
        return 'Project';
    }
};

window.getSendingMdExt = function() {
    const fmt = window.sendFormat;
    if (fmt === 'pdf') return 'pdf';
    if (fmt === 'jpeg' || fmt === 'jpg') return 'jpeg';
    return 'md';
};

window.getSendingMdSubDir = function() {
    return _path.join('gravity_vault', 'SendingMD');
};

window.makeSendingMdTreeName = function() {
    const ext = window.getSendingMdExt();
    return _path.join(window.getSendingMdSubDir(), `${window.getSendingMdFolderTag()}_${window.getSendingMdTimeTag()}.${ext}`);
};

window.makeSendingMdRulesName = function() {
    const ext = window.getSendingMdExt();
    return _path.join(window.getSendingMdSubDir(), `FollowThisORDER_${window.getSendingMdTimeTag()}.${ext}`);
};

window.makeSendingMdListDirName = function(dirPath = '.') {
    const ext = window.getSendingMdExt();
    const timeTag = window.getSendingMdTimeTag();
    let folderTag = _path.basename(dirPath || '') || 'Root';
    if (dirPath === '.' || dirPath === './' || dirPath === '.\\') {
        folderTag = window.getSendingMdFolderTag();
    }
    folderTag = folderTag.replace(/[^\w\u3131-\u318E\uAC00-\uD7A3\-]/gi, '_').replace(/_+/g, '_');
    return _path.join(window.getSendingMdSubDir(), `ListDir_${folderTag}_${timeTag}.${ext}`);
};

window.makeSendingMdBundleName = function(filePaths = []) {
    const ext = window.getSendingMdExt();
    const timeTag = window.getSendingMdTimeTag();
    if (!filePaths || filePaths.length === 0) {
        return _path.join(window.getSendingMdSubDir(), `Files_bundle_${timeTag}.${ext}`);
    }
    const names = filePaths.map(f => {
        const b = _path.basename(f || '');
        return b.replace(/[^\w\s\u3131-\u318E\uAC00-\uD7A3\.\-]/gi, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
    }).filter(Boolean);

    if (names.length === 0) {
        return _path.join(window.getSendingMdSubDir(), `Files_bundle_${timeTag}.${ext}`);
    }

    if (names.length <= 3) {
        return _path.join(window.getSendingMdSubDir(), `Files_${names.join('_')}_${timeTag}.${ext}`);
    } else {
        const first3 = names.slice(0, 3).join('_');
        const remaining = names.length - 3;
        return _path.join(window.getSendingMdSubDir(), `Files_${first3}_${remaining}more_${timeTag}.${ext}`);
    }
};

window.generateJpegFromText = function(text, targetJpegPath) {
    return new Promise((resolve) => {
        try {
            const lines = text.split('\n');
            const fontSize = 13;
            const lineHeight = 19;
            const padding = 24;
            
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            ctx.font = `${fontSize}px 'JetBrains Mono', 'Consolas', monospace`;
            
            let maxLineWidth = 600;
            lines.forEach(l => {
                const w = ctx.measureText(l).width;
                if (w > maxLineWidth) maxLineWidth = w;
            });

            canvas.width = Math.min(2400, Math.ceil(maxLineWidth + padding * 2));
            canvas.height = Math.max(200, Math.ceil(lines.length * lineHeight + padding * 2 + 40));

            // Background
            ctx.fillStyle = '#0d1117';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Header Banner
            ctx.fillStyle = '#161b22';
            ctx.fillRect(0, 0, canvas.width, 34);
            ctx.fillStyle = '#38bdf8';
            ctx.font = `bold 11px 'DM Sans', sans-serif`;
            ctx.fillText('GRAVITY Briefing Payload (JPEG)', padding, 21);

            // Text
            ctx.fillStyle = '#c9d1d9';
            ctx.font = `${fontSize}px 'JetBrains Mono', 'Consolas', monospace`;
            
            lines.forEach((l, idx) => {
                ctx.fillText(l, padding, 34 + padding + (idx * lineHeight));
            });

            const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
            const base64Data = dataUrl.replace(/^data:image\/jpeg;base64,/, '');
            const fs = require('fs');
            fs.writeFileSync(targetJpegPath, Buffer.from(base64Data, 'base64'));
            resolve(true);
        } catch(err) {
            console.error('JPEG generation failed:', err);
            resolve(false);
        }
    });
};

window.cleanSendingMdOldFiles = function() {
    if (window.auto_delete_SendingMD === false) return;
    try {
        const fs = require('fs');
        const gravityRoot = window.appRootPath || process.cwd();
        const subDir = (typeof window.getSendingMdSubDir === 'function') ? window.getSendingMdSubDir() : _path.join('gravity_vault', 'SendingMD');
        const sendingMdDir = _path.join(gravityRoot, subDir);

        if (!fs.existsSync(sendingMdDir)) return;

        const subfiles = fs.readdirSync(sendingMdDir).filter(f => !f.startsWith('.'));
        if (subfiles.length >= 15) {
            const fileStats = subfiles.map(f => {
                const fp = _path.join(sendingMdDir, f);
                try {
                    const stat = fs.statSync(fp);
                    return { file: f, path: fp, mtime: stat.mtimeMs };
                } catch(e) {
                    return { file: f, path: fp, mtime: 0 };
                }
            }).sort((a, b) => b.mtime - a.mtime);

            // Keep the latest 3 files, delete the older files (index >= 3)
            const filesToDelete = fileStats.slice(3);
            let deletedCount = 0;
            for (const item of filesToDelete) {
                try {
                    fs.unlinkSync(item.path);
                    deletedCount++;
                } catch(e) {}
            }

            if (deletedCount > 0) {
                console.log(`[AutoDeleteSendingMD] SendingMD reached ${subfiles.length} files. Cleaned ${deletedCount} older files, kept latest 3.`);
                if (typeof window.updateSendingMdCountBadge === 'function') window.updateSendingMdCountBadge();
            }
        }
    } catch(e) {
        console.error("[AutoDeleteSendingMD] Cleanup error:", e);
    }
};

window.prepareFilePayload = async function(baseFileName, mdContent) {
    const fs = require('fs');
    const gravityRoot = window.appRootPath || process.cwd();
    const sendingMdDir = _path.join(gravityRoot, window.getSendingMdSubDir ? window.getSendingMdSubDir() : _path.join('gravity_vault', 'SendingMD'));
    if (!fs.existsSync(sendingMdDir)) fs.mkdirSync(sendingMdDir, { recursive: true });

    const mdPath = _path.join(gravityRoot, baseFileName);
    fs.writeFileSync(mdPath, mdContent, 'utf-8');

    if (window.sendFormat === 'jpeg' || window.sendFormat === 'jpg') {
        const jpegFileName = baseFileName.replace(/\.(md|pdf)$/, '.jpeg');
        const jpegPath = _path.join(gravityRoot, jpegFileName);
        const ok = await window.generateJpegFromText(mdContent, jpegPath);
        if (ok && fs.existsSync(jpegPath)) {
            if (typeof window.cleanSendingMdOldFiles === 'function') window.cleanSendingMdOldFiles();
            if (typeof window.updateSendingMdCountBadge === 'function') window.updateSendingMdCountBadge();
            return { relativePath: jpegFileName, absolutePath: jpegPath };
        }
    }

    if (window.sendFormat === 'pdf') {
        const pdfFileName = baseFileName.replace(/\.md$/, '.pdf');
        const pdfPath = _path.join(gravityRoot, pdfFileName);
        const htmlContent = typeof marked !== 'undefined' ? marked.parse(mdContent) : `<pre>${mdContent.replace(/</g, '&lt;')}</pre>`;
        const success = await ipcRenderer.invoke('convert-markdown-to-pdf', {
            mdPath: mdPath,
            pdfPath: pdfPath,
            htmlContent: htmlContent
        });
        if (success && fs.existsSync(pdfPath)) {
            if (typeof window.cleanSendingMdOldFiles === 'function') window.cleanSendingMdOldFiles();
            if (typeof window.updateSendingMdCountBadge === 'function') window.updateSendingMdCountBadge();
            return { relativePath: pdfFileName, absolutePath: pdfPath };
        }
    }
    if (typeof window.cleanSendingMdOldFiles === 'function') window.cleanSendingMdOldFiles();
    if (typeof window.updateSendingMdCountBadge === 'function') window.updateSendingMdCountBadge();
    return { relativePath: baseFileName, absolutePath: mdPath };
};
