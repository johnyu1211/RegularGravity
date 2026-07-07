function extractHtmlOutline(htmlContent) {
    let processed = htmlContent.replace(/<!--[\s\S]*?-->/g, '');
    processed = processed.replace(/<script([\s\S]*?)>([\s\S]*?)<\/script>/gi, '');
    processed = processed.replace(/<style([\s\S]*?)>([\s\S]*?)<\/style>/gi, '');
    
    const lines = processed.replace(/\r/g, '').split('\n');
    const outlineLines = [];
    for (let line of lines) {
        let trimmed = line.trim();
        if (!trimmed) continue;
        
        let lineOut = line.replace(/<([a-zA-Z0-9:-]+)([^>]*?)>/g, (match, tagName, attrs) => {
            if (match.startsWith('</')) return match;
            
            const idMatch = attrs.match(/id=["']([^"']+)["']/i);
            const classMatch = attrs.match(/class=["']([^"']+)["']/i);
            
            let result = `<${tagName}`;
            if (idMatch) result += ` id="${idMatch[1]}"`;
            if (classMatch) result += ` class="${classMatch[1]}"`;
            
            if (attrs.trim().endsWith('/')) {
                result += ' /';
            }
            result += '>';
            return result;
        });
        
        lineOut = lineOut.replace(/>[^<]+</g, '><');
        
        if (lineOut.trim() === '') continue;
        outlineLines.push(lineOut);
    }
    return outlineLines.join('\n').replace(/\n\s*\n/g, '\n').trim();
}

function extractCodeOutline(content, ext) {
    const foldLangs = ['js', 'jsx', 'ts', 'tsx', 'html', 'htm', 'css', 'json', 'c', 'cpp', 'java', 'go', 'rs', 'py', 'php', 'swift'];
    if (!foldLangs.includes(ext)) {
        return content;
    }
    if (ext === 'html' || ext === 'htm') {
        return extractHtmlOutline(content);
    }
    const lines = content.replace(/\r/g, '').split('\n');
    let outlineLines = [];
    let skipDepth = 0;
    
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        
        let openBraces = 0;
        let closeBraces = 0;
        for (let char of line) {
            if (char === '{') openBraces++;
            if (char === '}') closeBraces++;
        }
        let net = openBraces - closeBraces;
        
        if (skipDepth > 0) {
            skipDepth += net;
            if (skipDepth <= 0) {
                skipDepth = 0;
                let indent = line.match(/^\s*/)[0];
                outlineLines.push(`${indent}}`);
            }
            continue;
        }
        
        if (net > 0) {
            outlineLines.push(line + " // [BODY COLLAPSED]");
            skipDepth = net;
        } else {
            outlineLines.push(line);
        }
    }
    return outlineLines.join('\n');
}
