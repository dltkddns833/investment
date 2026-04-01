"""텔레그램 봇으로 알림 발송 + 승인 플로우"""
import sys
import time
import json
from pathlib import Path
from dotenv import load_dotenv
import os
import requests

load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

TELEGRAM_BOT_TOKEN = os.environ["TELEGRAM_BOT_TOKEN"]
TELEGRAM_CHAT_ID = os.environ["TELEGRAM_CHAT_ID"]
TELEGRAM_API = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}"


def send_telegram(message):
    url = f"{TELEGRAM_API}/sendMessage"
    resp = requests.post(url, json={
        "chat_id": TELEGRAM_CHAT_ID,
        "text": message,
        "parse_mode": "Markdown",
    })
    if resp.status_code == 400:
        # Markdown 파싱 실패 시 plain text로 재시도
        resp = requests.post(url, json={
            "chat_id": TELEGRAM_CHAT_ID,
            "text": message,
        })
    resp.raise_for_status()
    print("텔레그램 발송 완료")
    return resp.json().get("result", {}).get("message_id")


def send_approval_request(message, date_str):
    """InlineKeyboardMarkup으로 승인/거부 버튼 발송, message_id 반환"""
    url = f"{TELEGRAM_API}/sendMessage"
    keyboard = {
        "inline_keyboard": [[
            {"text": "\u2705 승인", "callback_data": f"approve_{date_str}"},
            {"text": "\u274c 거부", "callback_data": f"reject_{date_str}"},
        ]]
    }
    resp = requests.post(url, json={
        "chat_id": TELEGRAM_CHAT_ID,
        "text": message,
        "parse_mode": "Markdown",
        "reply_markup": keyboard,
    })
    resp.raise_for_status()
    message_id = resp.json().get("result", {}).get("message_id")
    print(f"승인 요청 발송 완료 (message_id: {message_id})")
    return message_id


def wait_for_approval(date_str, timeout_sec=300):
    """getUpdates 폴링으로 callback_query 대기.

    Args:
        date_str: 매칭할 날짜 (approve_{date_str} / reject_{date_str})
        timeout_sec: 최대 대기 시간 (기본 5분)

    Returns:
        True=승인, False=거부 또는 타임아웃
    """
    start = time.time()
    last_update_id = 0

    # 기존 업데이트 건너뛰기
    try:
        resp = requests.get(f"{TELEGRAM_API}/getUpdates", params={"offset": -1, "timeout": 0}, timeout=5)
        updates = resp.json().get("result", [])
        if updates:
            last_update_id = updates[-1]["update_id"] + 1
    except Exception:
        pass

    while time.time() - start < timeout_sec:
        try:
            resp = requests.get(
                f"{TELEGRAM_API}/getUpdates",
                params={"offset": last_update_id, "timeout": 2, "allowed_updates": json.dumps(["callback_query"])},
                timeout=10,
            )
            updates = resp.json().get("result", [])
        except Exception:
            time.sleep(2)
            continue

        for update in updates:
            last_update_id = update["update_id"] + 1
            callback = update.get("callback_query")
            if not callback:
                continue

            data = callback.get("data", "")
            callback_id = callback.get("id")

            if data == f"approve_{date_str}":
                # 승인 응답
                _answer_callback(callback_id, "\u2705 승인되었습니다")
                print(f"승인됨: {date_str}")
                return True
            elif data == f"reject_{date_str}":
                # 거부 응답
                _answer_callback(callback_id, "\u274c 거부되었습니다")
                print(f"거부됨: {date_str}")
                return False

        time.sleep(1)

    print(f"타임아웃: {timeout_sec}초 내 응답 없음")
    send_telegram(f"\u23f0 승인 요청 타임아웃 ({date_str}) — 주문이 취소됩니다.")
    return False


def _answer_callback(callback_query_id, text):
    """callback_query 응답 확인"""
    try:
        requests.post(
            f"{TELEGRAM_API}/answerCallbackQuery",
            json={"callback_query_id": callback_query_id, "text": text},
            timeout=5,
        )
    except Exception:
        pass


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--test-approval":
        date = sys.argv[2] if len(sys.argv) > 2 else "2026-03-24"
        send_approval_request(f"\U0001f4cb *테스트 승인 요청* ({date})\n\n승인 버튼을 눌러주세요.", date)
        result = wait_for_approval(date, timeout_sec=60)
        print(f"결과: {'승인' if result else '거부/타임아웃'}")
    else:
        message = sys.argv[1] if len(sys.argv) > 0 else "테스트 메시지입니다."
        send_telegram(message)
