const _path = require('path');

window.getSendingMdTimeTag = function() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
};

window.getSendingMdFolderTag = function() {
    try {
        const cur = window.currentPath || window.projectRoot || process.cwd();
        const name = _path.basename(cur) || 'Project';
        return name.replace(/[^a-zA-Z0-9_\-]/g, '_');
    } catch(e) {
        return 'Project';
    }
};

window.makeSendingMdTreeName = function() {
    const ext = window.sendFormat === 'pdf' ? 'pdf' : 'md';
    return _path.join('SendingMD', `${window.getSendingMdFolderTag()}_${window.getSendingMdTimeTag()}.${ext}`);
};

window.makeSendingMdRulesName = function() {
    const ext = window.sendFormat === 'pdf' ? 'pdf' : 'md';
    return _path.join('SendingMD', `FollowThisORDER_${window.getSendingMdTimeTag()}.${ext}`);
};

window.makeSendingMdListDirName = function(dirPath = '.') {
    const ext = window.sendFormat === 'pdf' ? 'pdf' : 'md';
    const timeTag = window.getSendingMdTimeTag();
    let folderTag = _path.basename(dirPath || '') || 'Root';
    if (dirPath === '.' || dirPath === './' || dirPath === '.\\') {
        folderTag = window.getSendingMdFolderTag();
    }
    folderTag = folderTag.replace(/[^a-zA-Z0-9_\-]/g, '_');
    return _path.join('SendingMD', `ListDir_${folderTag}_${timeTag}.${ext}`);
};


window.makeSendingMdBundleName = function(filePaths = []) {
    const ext = window.sendFormat === 'pdf' ? 'pdf' : 'md';
    const timeTag = window.getSendingMdTimeTag();
    if (!filePaths || filePaths.length === 0) {
        return _path.join('SendingMD', `Files_bundle_${timeTag}.${ext}`);
    }
    const names = filePaths.map(f => {
        const b = _path.basename(f);
        return b.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
    });

    if (names.length <= 3) {
        return _path.join('SendingMD', `Files_${names.join('_')}_${timeTag}.${ext}`);
    } else {
        const first3 = names.slice(0, 3).join('_');
        const remaining = names.length - 3;
        return _path.join('SendingMD', `Files_${first3}_${remaining}more_${timeTag}.${ext}`);
    }
};

window.prepareFilePayload = async function(baseFileName, mdContent) {
    const fs = require('fs');
    const gravityRoot = window.appRootPath || process.cwd();
    const sendingMdDir = _path.join(gravityRoot, 'SendingMD');
    if (!fs.existsSync(sendingMdDir)) fs.mkdirSync(sendingMdDir, { recursive: true });

    const mdPath = _path.join(gravityRoot, baseFileName);
    fs.writeFileSync(mdPath, mdContent, 'utf-8');

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
            if (typeof window.updateSendingMdCountBadge === 'function') window.updateSendingMdCountBadge();
            return { relativePath: pdfFileName, absolutePath: pdfPath };
        }
    }
    if (typeof window.updateSendingMdCountBadge === 'function') window.updateSendingMdCountBadge();
    return { relativePath: baseFileName, absolutePath: mdPath };
};
