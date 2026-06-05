"""Q v2.1 — 임계 완화 검토 (2026-06-05)

실전 12+1영업일(5/19~6/5) 시그널 0건. 12영업일은 universe.csv leading zero
손실로 평가 누락(주원인), 6/5 하루는 패치 후 정상 평가 280회 = 시그널 자체 희소.

이 스크립트는 v2.1 기본 룰의 tp/sl/hold/시간대를 고정하고, **진입 임계만**
프리셋 그리드로 학습/검증/통합 백테스트해 임계 완화 효과를 정량화한다.

고정:
  TP = +2.5%, SL = -1.5%, HOLD = 30m
  시간대 09:30 ~ 14:00, 동시 1슬롯
  분할: 학습 < 2026-05-11 ≤ 검증

그리드:
  prev_5m ≤ {-2.0, -2.5(v2.1)}
  candle ≥ {None(폐기), 0.0, 0.1, 0.2, 0.3(v2.1)}
"""
from __future__ import annotations

import sys
import warnings
import itertools
from pathlib import Path
from datetime import date

import pandas as pd

warnings.filterwarnings("ignore")

# 08_robust.py 재사용
sys.path.insert(0, str(Path(__file__).parent))
import importlib.util
spec = importlib.util.spec_from_file_location("robust08", Path(__file__).parent / "08_robust.py")
robust = importlib.util.module_from_spec(spec)
spec.loader.exec_module(robust)

precompute = robust.precompute
simulate = robust.simulate
summarize = robust.summarize
SPLIT_DATE = robust.SPLIT_DATE
REPORT_DIR = robust.REPORT_DIR


def load_data():
    """08_robust.py 동일 — index가 datetime, date/hm 컬럼 추가."""
    print("데이터 로드...")
    import glob
    data = {}
    for f in sorted(glob.glob(str(robust.MINUTE_DIR / "*.pkl"))):
        ticker = Path(f).stem
        df = pd.read_pickle(f).copy()
        if df.empty or len(df) < 100:
            continue
        df["date"] = df.index.date
        df["hm"] = df.index.strftime("%H:%M")
        data[ticker] = df
    print(f"  {len(data)}종목 로드")
    return data


def run_grid(data):
    print("\n시그널 사전계산 (09:30~14:00)...")
    sig_all = precompute(data, lookback=5, hm_start="09:30", hm_end="14:00")
    sig_train = sig_all[sig_all["date"] < SPLIT_DATE].copy()
    sig_test = sig_all[sig_all["date"] >= SPLIT_DATE].copy()
    sig_full = sig_all.copy()
    print(f"  학습 {len(sig_train)} / 검증 {len(sig_test)} / 통합 {len(sig_full)} 분봉 후보")

    TP, SL, HOLD = 2.5, 1.5, 30
    grid_entry = [-2.0, -2.5]
    grid_candle = [None, 0.0, 0.1, 0.2, 0.3]  # None = 양봉 조건 폐기

    rows = []
    for e, c in itertools.product(grid_entry, grid_candle):
        if c is None:
            mask_tr = sig_train["prev_5m"] <= e
            mask_te = sig_test["prev_5m"] <= e
            mask_fu = sig_full["prev_5m"] <= e
            label_c = "off"
        else:
            mask_tr = (sig_train["prev_5m"] <= e) & (sig_train["candle"] >= c)
            mask_te = (sig_test["prev_5m"] <= e) & (sig_test["candle"] >= c)
            mask_fu = (sig_full["prev_5m"] <= e) & (sig_full["candle"] >= c)
            label_c = f"≥{c:+.1f}"

        tr = simulate(data, sig_train[mask_tr], TP, SL, HOLD, 1)
        te = simulate(data, sig_test[mask_te], TP, SL, HOLD, 1)
        fu = simulate(data, sig_full[mask_fu], TP, SL, HOLD, 1)
        s_tr = summarize(tr, "train")
        s_te = summarize(te, "test")
        s_fu = summarize(fu, "full")

        rows.append({
            "entry": f"≤{e:.1f}",
            "candle": label_c,
            "tr_n": s_tr["n"], "tr_win%": s_tr["win%"], "tr_total%": s_tr["total%"],
            "te_n": s_te["n"], "te_win%": s_te["win%"], "te_total%": s_te["total%"],
            "fu_n": s_fu["n"], "fu_win%": s_fu["win%"], "fu_total%": s_fu["total%"],
            "fu_mdd%": s_fu["mdd%"],
            "fu_tp": s_fu["tp"], "fu_sl": s_fu["sl"], "fu_time": s_fu["time"],
        })

    df = pd.DataFrame(rows)
    out = REPORT_DIR / "11_threshold_relax.csv"
    df.to_csv(out, index=False)
    print(f"\n결과 저장: {out}")
    return df


def render(df):
    print("\n" + "=" * 100)
    print("임계 완화 그리드 결과 (TP=+2.5 / SL=-1.5 / HOLD=30m, 09:30~14:00)")
    print("=" * 100)
    cols = ["entry", "candle",
            "tr_n", "tr_win%", "tr_total%",
            "te_n", "te_win%", "te_total%",
            "fu_n", "fu_win%", "fu_total%", "fu_mdd%",
            "fu_tp", "fu_sl", "fu_time"]
    print(df[cols].to_string(index=False))

    # v2.1 baseline 위치
    v21 = df[(df["entry"] == "≤-2.5") & (df["candle"] == "≥+0.3")]
    if len(v21):
        print("\n[baseline v2.1]")
        print(v21[cols].to_string(index=False))


def main():
    data = load_data()
    df = run_grid(data)
    render(df)


if __name__ == "__main__":
    main()
