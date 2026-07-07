function extractHtmlOutline(htmlContent) {
    let processed = htmlContent.replace(/<!--[\s\S]*?-->/g, '');
    processed = processed.replace(/<script([\s\S]*?)>([\s\S]*?)<\/script>/gi, '<script$1>// [SCRIPT BODY COLLAPSED]</script>');
    processed = processed.replace(/<style([\s\S]*?)>([\s\S]*?)<\/style>/gi, '<style$1>/* [STYLE BODY COLLAPSED] */</style>');
    
    const lines = processed.replace(/\r/g, '').split('\n');
    const outlineLines = [];
    for (let line of lines) {
        let trimmed = line.trim();
        if (!trimmed) continue;
        let lineOut = line;
        const textMatch = line.match(/>([^<]{30,})</);
        if (textMatch) {
            const longText = textMatch[1];
            lineOut = line.replace(longText, ` ... [TEXT COLLAPSED (${longText.length} chars)] ... `);
        }
        outlineLines.push(lineOut);
    }
    return outlineLines.join('\n');
}

function extractCodeOutline(content, ext) {
    const foldLangs = ['js', 'jsx', 'ts', 'tsx', 'html', 'css', 'json', 'c', 'cpp', 'java', 'go', 'rs', 'py', 'php', 'swift'];
    if (!foldLangs.includes(ext)) {
        return content;
    }
    if (ext === 'html') {
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
