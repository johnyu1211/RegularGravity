
let currentAnalysisId = 0;
let currentAbortController = null;

async function runAiAnalysis(filePath) {
    console.log("[VaporTool] Running AI Analysis on:", filePath);
    const myId = ++currentAnalysisId;
    if (currentAbortController) currentAbortController.abort();
    currentAbortController = new AbortController();
    const signal = currentAbortController.signal;

    const clearEl = (id) => { const el=document.getElementById(id); if(el) el.innerHTML=''; };
    clearEl('ai-res-overview'); clearEl('ai-res-functions'); clearEl('ai-res-dependencies'); clearEl('ai-res-insights-side'); clearEl('ai-res-insights');
    
    // Set priority loading placeholders
    document.getElementById('ai-res-functions').innerHTML = '<span class="loading-text">ENGINEERING BLUEPRINT...</span>';

    try {
        const content = await ipcRenderer.invoke('read-file', filePath);
        const modelSelect = document.getElementById('ollama-model-select');
        const modelName = modelSelect ? modelSelect.value : 'gemma:2b';

        // Reordered Prompt to prioritize [functions]
        const prompt = `당신은 핵심적인 소프트웨어 아티텍트입니다. 다음 소스코드를 분석하여 결과를 각 섹션 태그에 맞춰 답변하세요. 한글로 답변하세요.
중요: 답변은 반드시 [functions], [overview], [dependencies], [insights] 네 섹션을 포함해야 하며 순서대로 답변하세요.

[functions]
- 파일 내 핵심 함수, 클래스, 로직의 블루프린트를 트리 구조나 요약 표로 상세히 설명하세요.
- 각 항목의 역할과 입출력을 명확히 하세요.

[overview]
- 전체적인 아키텍처와 로직의 흐름을 3~5개의 핵심 불렛포인트로 설명하세요.
- SCORE:95 이 형식을 줄 끝에 포함하여 품질 점수를 매기세요.

[dependencies]
- 사용된 주요 라이브러리나 모듈 목록을 불렛포인트로 나열하세요.

[insights]
- 잠재적 위험, 성능 개선안, 아키텍처적 조언을 포함하세요.`;

        window.currentAiContext = { code: content, isGroup: false };

        const res = await fetch('http://localhost:11434/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: modelName,
                prompt: `Source Code:\n\`\`\`\n${content}\n\`\`\`\n\nTask: ${prompt}`,
                stream: true,
                options: { temperature: 0.1, num_predict: 3000 }
            }),
            signal
        });

        if (!res.ok) throw new Error('API Request Failed');
        const reader = res.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let fullText = '', currentSection = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (signal.aborted || myId !== currentAnalysisId) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n').filter(line => line.trim() !== '');

            for (const line of lines) {
                try {
                    const parsed = JSON.parse(line);
                    const token = parsed.response || '';
                    fullText += token;

                    // Section Detection
                    const lower = fullText.toLowerCase();
                    if (lower.includes('[functions]')) currentSection = 'functions';
                    if (lower.includes('[overview]')) currentSection = 'overview';
                    if (lower.includes('[dependencies]')) currentSection = 'dependencies';
                    if (lower.includes('[insights]')) currentSection = 'insights';

                    // Progressive Data Binding
                    const cleanToken = token.replace(/\[functions\]|\[overview\]|\[dependencies\]|\[insights\]/gi, '');
                    if (currentSection === 'functions') {
                        const target = document.getElementById('ai-res-functions');
                        if (target.querySelector('.loading-text')) target.innerHTML = '';
                        target.innerHTML += marked.parse(cleanToken);
                    } else if (currentSection === 'overview') {
                        document.getElementById('ai-res-overview').innerHTML += marked.parse(cleanToken);
                        // Extract Score
                        const m = fullText.match(/SCORE\s*:\s*(\d+)/i);
                        if (m) document.getElementById('health-value').innerText = m[1];
                    } else if (currentSection === 'dependencies') {
                        document.getElementById('ai-res-dependencies').innerHTML += marked.parse(cleanToken);
                    } else if (currentSection === 'insights') {
                        document.getElementById('ai-res-insights-side').innerHTML += marked.parse(cleanToken);
                        document.getElementById('ai-res-insights').innerHTML += marked.parse(cleanToken);
                    }
                } catch (e) {}
            }
        }
    } catch (err) {
        if (err.name === 'AbortError') return;
        console.error('AI Analysis Error:', err);
    }
}
