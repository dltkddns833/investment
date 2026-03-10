"""Gmail SMTP로 이메일 발송"""
import smtplib
import sys
from email.mime.text import MIMEText
from pathlib import Path
from dotenv import load_dotenv
import os

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

GMAIL_ADDRESS = os.environ["GMAIL_ADDRESS"]
GMAIL_APP_PASSWORD = os.environ["GMAIL_APP_PASSWORD"]


def send_email(subject, body):
    msg = MIMEText(body, "plain", "utf-8")
    msg["Subject"] = subject
    msg["From"] = GMAIL_ADDRESS
    msg["To"] = GMAIL_ADDRESS

    with smtplib.SMTP("smtp.gmail.com", 587) as server:
        server.starttls()
        server.login(GMAIL_ADDRESS, GMAIL_APP_PASSWORD)
        server.send_message(msg)

    print(f"이메일 발송 완료: {subject}")


if __name__ == "__main__":
    subject = sys.argv[1] if len(sys.argv) > 1 else "테스트"
    body = sys.argv[2] if len(sys.argv) > 2 else "테스트 이메일입니다."
    send_email(subject, body)
