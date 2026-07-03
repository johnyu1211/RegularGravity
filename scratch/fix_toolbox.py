import os

path_js = r'f:\VOXELVERSE\InnerProject\VaporTool\renderer.js'
path_css = r'f:\VOXELVERSE\InnerProject\VaporTool\style.css'

# 1. Update CSS: Deep Spacing & No Hover Effects
with open(path_css, 'r', encoding='utf-8') as f:
    css = f.read()

spacing_styles = """
/* Deep Spacing for Readability */
.msg-content p, .msg-content h1, .msg-content h2, .msg-content h3, .msg-content ul, .msg-content ol {
    margin-bottom: 20px !important;
    line-height: 1.8;
}
.msg-content hr {
    margin: 30px 0 !important;
    border: 0;
    border-top: 1px solid #222;
}
.msg-bubble:hover {
    border-color: transparent !important;
    background: transparent !important;
    box-shadow: none !important;
}
.bubble-action-btn:hover {
    color: #fff !important;
    transform: scale(1.1);
}
"""
if "/* Deep Spacing for Readability */" not in css:
    css += spacing_styles

with open(path_css, 'w', encoding='utf-8') as f:
    f.write(css)

# 2. Update JS: Restore Both Actions & Real Retry
with open(path_js, 'r', encoding='utf-8') as f:
    js = f.read()

# Comprehensive rewrite of the buttons part in appendBubble
# Search for the action innerHTML assignment
old_actions = "actions.innerHTML = role === 'user' ? '<span class=\"bubble-action-btn edit-btn\">✏️</span>' : '<span class=\"bubble-action-btn retry-btn\">🔄</span>';"
new_actions = "actions.innerHTML = '<span class=\"bubble-action-btn edit-btn\">✏️</span> <span class=\"bubble-action-btn retry-btn\">🔄</span>';"

if old_actions in js:
    js = js.replace(old_actions, new_actions)
elif 'actions.innerHTML =' in js:
    # Backup replace for different versions
    import re
    js = re.sub(r"actions\.innerHTML = .*?;", new_actions, js)

# Inject full interaction logic
full_interaction = """
        // Action Handlers
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
                    saveChat();
                    if (window.addCopyButtons) window.addCopyButtons();
                };
            };
        }

        const retryBtn = actions.querySelector('.retry-btn');
        if (retryBtn) {
            retryBtn.onclick = () => {
                const prevUser = bubble.previousElementSibling;
                if (prevUser && prevUser.classList.contains('user-bubble')) {
                    const prompt = prevUser.querySelector('.msg-content').getAttribute('data-raw');
                    bubble.remove(); // Remove current response
                    document.getElementById('local-agent-input').value = prompt;
                    document.getElementById('send-to-local').click(); // Re-fire!
                } else if (bubble.classList.contains('user-bubble')) {
                    // If user bubble, just re-fire it directly
                    const prompt = content.getAttribute('data-raw');
                    const nextAi = bubble.nextElementSibling;
                    if (nextAi && nextAi.classList.contains('ai-bubble')) nextAi.remove();
                    document.getElementById('local-agent-input').value = prompt;
                    document.getElementById('send-to-local').click();
                }
            };
        }
"""

# Find where to inject (after bubble.appendChild(content);)
if 'bubble.appendChild(content);' in js:
    js = js.replace('bubble.appendChild(content);', 'bubble.appendChild(content);' + full_interaction)

with open(path_js, 'w', encoding='utf-8') as f:
    f.write(js)

print("Success: Deep spacing applied, hover effects removed, full AI/User actions restored with real retry.")
