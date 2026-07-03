
import http.client
import json
import os
from datetime import datetime

VAULT_PATH = r"f:\VOXELVERSE\InnerProject\VaporTool\vapor_vault\528bef72a92a8cbccaf3531637469fd6"
LOG_FILE = os.path.join(VAULT_PATH, "logs", "2026-04-22.md")
KNOWLEDGE_FILE = os.path.join(VAULT_PATH, "knowledge", "development_log.md")

def distill():
    if not os.path.exists(LOG_FILE):
        print("Log file not found.")
        return

    with open(LOG_FILE, 'r', encoding='utf-8') as f:
        log_content = f.read()

    prompt = f"다음은 지난 대화 기록입니다. 핵심만 추려 요약하세요. 불필요한 인사는 제외하고 [진행현황], [발생오류], [결정사항] 세 가지 섹션으로 답하세요.\n\nLOG:\n{log_content}"
    
    conn = http.client.HTTPConnection("localhost", 11434)
    payload = json.dumps({
        "model": "supergemma4-e4b-abliterated:latest",
        "prompt": prompt,
        "stream": False
    })
    headers = {'Content-Type': 'application/json'}
    
    print("Sending to Ollama...")
    conn.request("POST", "/api/generate", payload, headers)
    res = conn.getresponse()
    data = res.read()
    
    result = json.loads(data.decode())
    distilled_text = result.get('response', '')

    if distilled_text:
        with open(KNOWLEDGE_FILE, 'w', encoding='utf-8') as f:
            f.write(f"# [HYPER-SIMPLIFIED DICTIONARY] - DEVELOPMENT LOG\n")
            f.write(f"- LAST_MANUAL_UPDATE: {datetime.now().isoformat()}\n\n")
            f.write(distilled_text)
        print("Distillation complete. Knowledge file updated.")
    else:
        print("Failed to get response from Ollama.")

if __name__ == "__main__":
    distill()
