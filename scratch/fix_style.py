import os

path = r'f:\VOXELVERSE\InnerProject\VaporTool\style.css'
with open(path, 'r', encoding='utf-8', errors='ignore') as f:
    content = f.read()

# Filter out all previous messy attempts
if '/* Premium Chat Animations' in content:
    content = content.split('/* Premium Chat Animations')[0]
elif '/* Premium List Styles' in content:
    content = content.split('/* Premium List Styles')[0]

new_styles = """
/* Premium Chat Animations & Effects */
@keyframes bubbleFadeIn {
    from { opacity: 0; transform: translateY(15px) scale(0.97); }
    to { opacity: 1; transform: translateY(0) scale(1); }
}
.msg-bubble {
    animation: bubbleFadeIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
    transition: all 0.3s ease;
    position: relative;
    box-shadow: 0 4px 15px rgba(0,0,0,0.2);
}
.ai-bubble:hover {
    background: rgba(255,255,255,0.03) !important;
    border-color: rgba(0,255,149,0.3) !important;
    box-shadow: 0 0 20px rgba(0,255,149,0.1);
}
.user-bubble:hover {
    background: rgba(255,255,255,0.08) !important;
    box-shadow: 0 0 20px rgba(255,255,255,0.1);
}

/* Premium List Styles */
.msg-content ul, .msg-content ol {
    padding-left: 22px;
    margin: 12px 0;
    color: #ccc;
    font-size: 11px;
    line-height: 1.7;
}
.msg-content li {
    margin-bottom: 8px;
    position: relative;
}
.msg-content ul li::before {
    content: '\\u2022';
    color: #00ff95;
    font-weight: bold;
    display: inline-block; 
    width: 1.2em;
    margin-left: -1.2em;
    text-shadow: 0 0 8px #00ff95;
    font-size: 1.2em;
}
.msg-content ol {
    list-style-type: decimal;
    color: #00ff95;
    font-weight: bold;
}
.msg-content ol li {
    color: #ccc;
    font-weight: normal;
}
"""

with open(path, 'w', encoding='utf-8') as f:
    f.write(content.strip() + "\\n" + new_styles)

print("Success: style.css cleaned and premium effects applied.")
