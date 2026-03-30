"""로깅 유틸리티 모듈"""
import logging
from datetime import datetime
from pathlib import Path


def get_logger(name):
    logger = logging.getLogger(name)
    if logger.handlers:
        return logger
    logger.setLevel(logging.DEBUG)

    # 콘솔: INFO (정기 실행 모듈은 시간 포함)
    console = logging.StreamHandler()
    console.setLevel(logging.INFO)
    timed_modules = {"o_monitor", "meta_manager"}
    if name in timed_modules:
        console.setFormatter(logging.Formatter('%(asctime)s %(message)s', datefmt='%H:%M:%S'))
    else:
        console.setFormatter(logging.Formatter('%(message)s'))
    logger.addHandler(console)

    # 파일: DEBUG — 모듈별 하위 폴더 (pipeline/meta/o_monitor/storytelling)
    log_root = Path(__file__).resolve().parent.parent.parent / "logs"
    # 모듈명으로 폴더 결정 (기본값: pipeline)
    folder_map = {"meta_manager": "meta", "o_monitor": "o_monitor", "storytelling": "storytelling"}
    folder = folder_map.get(name, "pipeline")
    log_dir = log_root / folder
    log_dir.mkdir(parents=True, exist_ok=True)
    fh = logging.FileHandler(
        log_dir / f"{folder}_{datetime.now():%Y-%m-%d}.log",
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
