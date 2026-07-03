import os

path_js = r'f:\VOXELVERSE\InnerProject\VaporTool\renderer.js'

with open(path_js, 'r', encoding='utf-8') as f:
    js = f.read()

# We need a reusable "Generate" function that can target an existing bubble
# Let's extract the core logic of handleSend into a reusable internal function

new_js_logic = """
    const fireGeneration = async (prompt, targetBubble) => {
        let isAiThinking = true;
        const stopBtn = document.getElementById('stop-ai-btn');
        if (stopBtn) stopBtn.style.display = 'flex';
        
        targetBubble.classList.add('thinking');
        targetBubble.innerHTML = `
            <div class="msg-actions" style="position:absolute; top:5px; right:5px; opacity:0; transition:0.2s;">
                 <span class="bubble-action-btn edit-btn">✏️</span> <span class="bubble-action-btn retry-btn">🔄</span>
            </div>
            <div class="msg-content">
                <span class="thinking-dot">.</span><span class="thinking-dot">.</span><span class="thinking-dot">.</span>
                <span class="thinking-timer">[0.0s]</span>
            </div>
        `;
        // Re-bind actions immediately for the new structure if needed, 
        // but easier to just let it finish and re-bind later.

        let elapsed = 0;
        const timerInterval = setInterval(() => {
            elapsed += 0.1;
            const timerObj = targetBubble.querySelector('.thinking-timer');
            if (timerObj) timerObj.innerText = `[${elapsed.toFixed(1)}s]`;
        }, 100);

        const abortController = new AbortController();
        if (stopBtn) stopBtn.onclick = () => abortController.abort();

        const modelSelect = document.getElementById('ollama-model-select');
        const model = modelSelect ? modelSelect.value : 'gemma2:2b';

        try {
            const response = await fetch('http://localhost:11434/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model, prompt: prompt, stream: false }),
                signal: abortController.signal
            });
            if (!response.ok) throw new Error(`Ollama Error: ${response.status}`);
            const data = await response.json();
            clearInterval(timerInterval);
            
            targetBubble.classList.remove('thinking');
            // Re-render the bubble properly with the new data
            // We use the full appendBubble structure logic here
            const newContentText = data.response;
            targetBubble.innerHTML = `
                <div class="bubble-actions">
                    <span class="bubble-action-btn edit-btn">✏️</span> <span class="bubble-action-btn retry-btn">🔄</span>
                </div>
                <div class="msg-content" data-raw="${newContentText.replace(/"/g, '&quot;')}">
                    ${marked.parse(newContentText)}
                    <div style="font-size:9px; color:#333; margin-top:5px; text-align:right;">Elapsed: ${elapsed.toFixed(1)}s</div>
                </div>
            `;
            // Crucial: Re-bind events to the new elements inside the bubble
            bindBubbleActions(targetBubble, prompt, 'ai');
            if (window.addCopyButtons) window.addCopyButtons();
            const saveChat = () => {
                const chatMessages = document.getElementById('local-chat-messages');
                const msgs = Array.from(chatMessages.querySelectorAll('.msg-bubble')).map(b => ({
                    role: b.classList.contains('user-bubble') ? 'user' : 'ai',
                    text: b.querySelector('.msg-content').getAttribute('data-raw') || b.querySelector('.msg-content').innerText
                }));
                localStorage.setItem('vapor_chat_history', JSON.stringify(msgs));
            };
            saveChat();
        } catch (e) {
            clearInterval(timerInterval);
            const content = targetBubble.querySelector('.msg-content');
            if (content) content.innerText = e.name === 'AbortError' ? 'Generation Stopped.' : 'Error: ' + e.message;
        } finally {
            if (stopBtn) stopBtn.style.display = 'none';
        }
    };

    const bindBubbleActions = (bubble, text, role) => {
        const content = bubble.querySelector('.msg-content');
        const actions = bubble.querySelector('.bubble-actions');
        if (!actions) return;

        const editBtn = actions.querySelector('.edit-btn');
        if (editBtn) {
            editBtn.onclick = () => {
                const editArea = document.createElement('textarea');
                editArea.value = content.getAttribute('data-raw') || text;
                editArea.className = 'bubble-inline-edit';
                editArea.style = 'width:100%; min-height:100px; background:#000; color:#fff; border:1px solid #333; padding:10px; font-family:inherit; font-size:11px; line-height:1.6;';
                content.innerHTML = '';
                content.appendChild(editArea);
                editArea.focus();
                editArea.onblur = () => {
                    const newText = editArea.value;
                    content.setAttribute('data-raw', newText);
                    content.innerHTML = marked.parse(newText);
                    const chatMessages = document.getElementById('local-chat-messages');
                    const saveChat = () => {
                        const msgs = Array.from(chatMessages.querySelectorAll('.msg-bubble')).map(b => ({
                            role: b.classList.contains('user-bubble') ? 'user' : 'ai',
                            text: b.querySelector('.msg-content').getAttribute('data-raw') || b.querySelector('.msg-content').innerText
                        }));
                        localStorage.setItem('vapor_chat_history', JSON.stringify(msgs));
                    };
                    saveChat();
                    if (window.addCopyButtons) window.addCopyButtons();
                };
            };
        }

        const retryBtn = actions.querySelector('.retry-btn');
        if (retryBtn) {
            retryBtn.onclick = () => {
                let prompt = "";
                if (role === 'ai') {
                    const prevUser = bubble.previousElementSibling;
                    if (prevUser && prevUser.classList.contains('user-bubble')) {
                        prompt = prevUser.querySelector('.msg-content').getAttribute('data-raw');
                        fireGeneration(prompt, bubble);
                    }
                } else {
                    prompt = content.getAttribute('data-raw');
                    const nextAi = bubble.nextElementSibling;
                    if (nextAi && nextAi.classList.contains('ai-bubble')) {
                        fireGeneration(prompt, nextAi);
                    }
                }
            };
        }
    };
"""

# Replace the old retry logic inside appendBubble with bindBubbleActions call
if 'const appendBubble = (role, text) => {' in js:
    # We need to simplify appendBubble to use bindBubbleActions
    import re
    # Inject our new functions before appendBubble
    js = js.replace('const appendBubble = (role, text) => {', new_js_logic + '\nconst appendBubble = (role, text) => {')
    
    # Replace the internal logic of appendBubble to clean it up
    target_part_regex = r'// Action Handlers.*?chatMessages\.appendChild\(bubble\);'
    new_append_logic = """
        chatMessages.appendChild(bubble);
        bindBubbleActions(bubble, text, role);
    """
    js = re.sub(target_part_regex, new_append_logic, js, flags=re.DOTALL)

with open(path_js, 'w', encoding='utf-8') as f:
    f.write(js)

print("Success: In-place regeneration logic implemented. No duplicate user bubbles.")
