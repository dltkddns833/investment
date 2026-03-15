"""로깅 유틸리티 모듈"""
import logging
from datetime import datetime
from pathlib import Path


def get_logger(name):
    logger = logging.getLogger(name)
    if logger.handlers:
        return logger
    logger.setLevel(logging.DEBUG)

    # 콘솔: INFO
    console = logging.StreamHandler()
    console.setLevel(logging.INFO)
    console.setFormatter(logging.Formatter('%(message)s'))
    logger.addHandler(console)

    # 파일: DEBUG
    log_dir = Path(__file__).resolve().parent.parent.parent / "logs"
    log_dir.mkdir(exist_ok=True)
    fh = logging.FileHandler(
        log_dir / f"pipeline_{datetime.now():%Y-%m-%d}.log",
        encoding="utf-8",
    )
    fh.setLevel(logging.DEBUG)
    fh.setFormatter(logging.Formatter('%(asctime)s [%(name)s] %(levelname)s: %(message)s'))
    logger.addHandler(fh)

    return logger


def retry(max_retries=3, backoff_base=1.0):
    """Exponential backoff 재시도 데코레이터"""
    import time
    import functools

    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            for attempt in range(max_retries):
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    if attempt == max_retries - 1:
                        raise
                    wait = backoff_base * (2 ** attempt)
                    logger = get_logger(func.__module__ or __name__)
                    logger.warning(f"{func.__name__} 재시도 {attempt + 1}/{max_retries} ({wait:.1f}s 대기): {e}")
                    time.sleep(wait)
        return wrapper
    return decorator
