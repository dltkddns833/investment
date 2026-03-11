"""텔레그램 봇으로 알림 발송"""
import sys
from pathlib import Path
from dotenv import load_dotenv
import os
import requests

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

TELEGRAM_BOT_TOKEN = os.environ["TELEGRAM_BOT_TOKEN"]
TELEGRAM_CHAT_ID = os.environ["TELEGRAM_CHAT_ID"]


def send_telegram(message):
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    resp = requests.post(url, json={
        "chat_id": TELEGRAM_CHAT_ID,
        "text": message,
        "parse_mode": "Markdown",
    })
    resp.raise_for_status()
    print("텔레그램 발송 완료")


if __name__ == "__main__":
    message = sys.argv[1] if len(sys.argv) > 1 else "테스트 메시지입니다."
    send_telegram(message)
